import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma, RenderJob, User, UserRole } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { UploadsService } from '../uploads/uploads.service';
import { RENDER_ENGINE_ADAPTER, RenderEngineAdapter } from './adapters/render-engine.adapter';
import { CreateRenderJobDto } from './dto/render-job.dto';

const DEFAULT_PRIORITY = 100;
const PRIORITY_CLOUD_PROCESSING = 10;

@Injectable()
export class RenderJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(RENDER_ENGINE_ADAPTER)
    private readonly engine: RenderEngineAdapter,
    private readonly uploads: UploadsService,
  ) {}

  private assertOwnerOrAdmin(design: { ownerUserId: string }, user: User): void {
    if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the design owner' });
    }
  }

  private async ensureLatestVersion(designId: string, actorUserId: string) {
    const design = await this.prisma.design.findFirst({ where: { id: designId, deletedAt: null } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }

    const latest = await this.prisma.designVersion.findFirst({
      where: { designId },
      orderBy: { versionNumber: 'desc' },
    });
    if (latest) {
      return { design, version: latest };
    }

    const version = await this.prisma.designVersion.create({
      data: {
        designId: design.id,
        versionNumber: 1,
        status: design.status,
        parameters: design.parameters as Prisma.InputJsonValue,
        jewelerNotes: design.jewelerNotes,
        createdById: actorUserId,
        reason: 'render_job_snapshot',
      },
    });
    return { design, version };
  }

  async create(user: User, dto: CreateRenderJobDto): Promise<RenderJob> {
    const { design, version } = await this.ensureLatestVersion(dto.designId, user.id);
    this.assertOwnerOrAdmin(design, user);

    const [hasPriority, hasNoWatermark] = await Promise.all([
      this.entitlements.has(user.id, 'priority_cloud_processing'),
      this.entitlements.has(user.id, 'no_watermark'),
    ]);

    const job = await this.prisma.renderJob.create({
      data: {
        designId: design.id,
        designVersionId: version.id,
        status: JobStatus.QUEUED,
        priority: hasPriority ? PRIORITY_CLOUD_PROCESSING : DEFAULT_PRIORITY,
        exportFormat: dto.exportFormat ?? null,
        applyWatermark: !hasNoWatermark,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'render_job.create',
      entityType: 'RenderJob',
      entityId: job.id,
      after: toJsonValue(job),
    });

    return this.process(job, design.parameters, design.ownerUserId);
  }

  /** Stub processor: runs synchronously so callers see the terminal status immediately. */
  private async process(
    job: RenderJob,
    parameters: Prisma.JsonValue,
    ownerUserId: string,
  ): Promise<RenderJob> {
    const running = await this.prisma.renderJob.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING, startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const result = await this.engine.render({
        renderJobId: running.id,
        designId: running.designId,
        designVersionId: running.designVersionId,
        exportFormat: running.exportFormat,
        parameters,
        ownerUserId,
      });
      const outputUploadId = result.outputUploadId ?? (await this.stubOutput(ownerUserId, running.exportFormat)).id;

      const succeeded = await this.prisma.renderJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.SUCCEEDED,
          providerRef: result.providerRef,
          outputUploadId,
          finishedAt: new Date(),
        },
      });

      await this.outbox.enqueue('render.completed', {
        renderJobId: succeeded.id,
        designId: succeeded.designId,
        status: succeeded.status,
      });

      return succeeded;
    } catch (err) {
      return this.prisma.renderJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage: (err as Error).message,
          finishedAt: new Date(),
        },
      });
    }
  }

  private async getOwned(id: string, user: User) {
    const job = await this.prisma.renderJob.findUnique({
      where: { id },
      include: { design: { select: { ownerUserId: true } } },
    });
    if (!job) {
      throw new NotFoundException({ success: false, message: 'Render job not found' });
    }
    this.assertOwnerOrAdmin(job.design, user);
    return job;
  }

  async findOne(id: string, user: User): Promise<RenderJob> {
    const { design: _design, ...job } = await this.getOwned(id, user);
    return job;
  }

  async cancel(id: string, user: User): Promise<RenderJob> {
    const { design: _design, ...job } = await this.getOwned(id, user);
    if (job.status !== JobStatus.QUEUED && job.status !== JobStatus.RUNNING) {
      throw new BadRequestException({
        success: false,
        message: `Render job in status ${job.status} cannot be cancelled`,
      });
    }

    const cancelled = await this.prisma.renderJob.update({
      where: { id },
      data: { status: JobStatus.CANCELLED, finishedAt: new Date() },
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'render_job.cancel',
      entityType: 'RenderJob',
      entityId: id,
    });

    return cancelled;
  }

  private async stubOutput(ownerUserId: string, exportFormat: string | null) {
    if (exportFormat === 'PNG_HD') {
      const png = readFileSync(join(process.cwd(), 'seed-assets/showcase/work-ring.png'));
      return this.uploads.createGeneratedLocal(ownerUserId, png, 'image/png');
    }
    const stl = Buffer.from(
      'solid mailnvosky\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 1 0 0\n      vertex 0 1 0\n    endloop\n  endfacet\nendsolid mailnvosky\n',
    );
    return this.uploads.createGeneratedLocal(ownerUserId, stl, 'model/stl');
  }
}
