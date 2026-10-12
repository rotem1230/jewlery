import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Design, JobStatus, Prisma, RenderJob, User, UserRole } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../cms/app-config.service';
import { UploadAccessService } from '../uploads/upload-access.service';
import { toJsonValue } from '../audit/json.util';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { UploadsService } from '../uploads/uploads.service';
import { RENDER_ENGINE_ADAPTER, RenderEngineAdapter } from './adapters/render-engine.adapter';
import { CreateRenderJobDto } from './dto/render-job.dto';

const DEFAULT_PRIORITY = 100;
const PRIORITY_CLOUD_PROCESSING = 10;
const DEFAULT_DAILY_RENDERS_PER_USER = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RenderJobView = RenderJob & { outputUrl: string | null };

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
    private readonly access: UploadAccessService,
    private readonly appConfig: AppConfigService,
  ) {}

  private view(job: RenderJob): RenderJobView {
    return { ...job, outputUrl: this.access.urlFor(job.outputUploadId) };
  }

  private async dailyLimit(): Promise<number> {
    const raw = await this.appConfig.get('render_limits');
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).dailyPerUser : null;
    return typeof value === 'number' && value >= 0 ? value : DEFAULT_DAILY_RENDERS_PER_USER;
  }

  private assertOwnerOrAdmin(design: { ownerUserId: string }, user: User): void {
    if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the design owner' });
    }
  }

  /** Callers must have authorized `design` first: this may create a version row. */
  private async ensureLatestVersion(design: Design, actorUserId: string, db: Prisma.TransactionClient = this.prisma) {
    const designId = design.id;

    const latest = await db.designVersion.findFirst({
      where: { designId },
      orderBy: { versionNumber: 'desc' },
    });
    if (latest) {
      return { design, version: latest };
    }

    const version = await db.designVersion.create({
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

  async create(user: User, dto: CreateRenderJobDto): Promise<RenderJobView> {
    const found = await this.prisma.design.findFirst({ where: { id: dto.designId, deletedAt: null } });
    if (!found) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    // Authorize before any write.
    this.assertOwnerOrAdmin(found, user);

    const limit = await this.dailyLimit();
    const [hasPriority, hasNoWatermark] = await Promise.all([
      this.entitlements.has(user.id, 'priority_cloud_processing'),
      this.entitlements.has(user.id, 'no_watermark'),
    ]);

    // Count and create under the owner's row lock: simultaneous requests cannot all pass the
    // daily check (each job costs an engine run).
    const { design, job } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${found.ownerUserId}::uuid FOR UPDATE`;
      const today = await tx.renderJob.count({
        where: { design: { ownerUserId: found.ownerUserId }, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      if (today >= limit) {
        throw new HttpException(
          { success: false, message: 'Daily export limit reached', code: 'RENDER_QUOTA_EXCEEDED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const { version } = await this.ensureLatestVersion(found, user.id, tx);
      const created = await tx.renderJob.create({
        data: {
          designId: found.id,
          designVersionId: version.id,
          status: JobStatus.QUEUED,
          priority: hasPriority ? PRIORITY_CLOUD_PROCESSING : DEFAULT_PRIORITY,
          exportFormat: dto.exportFormat ?? null,
          applyWatermark: !hasNoWatermark,
        },
      });
      return { design: found, job: created };
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'render_job.create',
      entityType: 'RenderJob',
      entityId: job.id,
      after: toJsonValue(job),
    });

    return this.view(await this.process(job, design.parameters, design.ownerUserId));
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
          errorMessage: 'Render failed',
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

  async findOne(id: string, user: User): Promise<RenderJobView> {
    const { design: _design, ...job } = await this.getOwned(id, user);
    return this.view(job);
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
