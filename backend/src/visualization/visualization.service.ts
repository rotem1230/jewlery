import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, UploadStatus, User, UserRole, VisualizationJob } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { AppConfigService } from '../cms/app-config.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreateVisualizationJobDto, QueryVisualizationJobsDto } from './dto/visualization.dto';

const PAGE_SIZE = 20;
const DEFAULT_RETENTION_HOURS = 72;
const VIZ_ENTITLEMENT_KEY = 'personal_visualization';
const VIZ_FLAG = 'phase2_visualization';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

@Injectable()
export class VisualizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly appConfig: AppConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly uploads: UploadsService,
  ) {}

  private assertOwnerOrAdmin(job: { requestedById: string }, user: User): void {
    if (job.requestedById !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the visualization job owner' });
    }
  }

  private async retentionHours(): Promise<number> {
    const raw = await this.appConfig.get('viz_retention_hours');
    return typeof raw === 'number' ? raw : DEFAULT_RETENTION_HOURS;
  }

  async create(user: User, dto: CreateVisualizationJobDto): Promise<VisualizationJob> {
    const flagOn = await this.featureFlags.isEnabled(VIZ_FLAG, user);
    if (!flagOn) {
      throw new ForbiddenException({
        success: false,
        message: 'Visualization is not enabled',
        code: 'FEATURE_DISABLED',
      });
    }

    await this.entitlements.assert(user.id, VIZ_ENTITLEMENT_KEY);

    const design = await this.prisma.design.findFirst({ where: { id: dto.designId, deletedAt: null } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the design owner' });
    }

    const upload = await this.prisma.upload.findFirst({
      where: { id: dto.inputUploadId, ownerUserId: user.id, deletedAt: null },
    });
    if (!upload) {
      throw new BadRequestException({
        success: false,
        message: 'inputUploadId must reference an upload owned by the current user',
      });
    }

    const hours = await this.retentionHours();
    const job = await this.prisma.visualizationJob.create({
      data: {
        designId: design.id,
        requestedById: user.id,
        inputUploadId: upload.id,
        status: JobStatus.QUEUED,
        retentionExpiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'visualization_job.create',
      entityType: 'VisualizationJob',
      entityId: job.id,
      after: toJsonValue(job),
    });

    return this.process(job, user.id);
  }

  /** Overlay catalog jewelry onto the selfie as a distinct output upload (never echo the input). */
  private async process(job: VisualizationJob, ownerUserId: string): Promise<VisualizationJob> {
    const overlay = this.readOverlayPng();
    const output = await this.uploads.createGeneratedLocal(ownerUserId, overlay, 'image/png');

    const succeeded = await this.prisma.visualizationJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.SUCCEEDED,
        outputUploadId: output.id,
        finishedAt: new Date(),
      },
    });

    await this.outbox.enqueue('visualization.completed', {
      visualizationJobId: succeeded.id,
      designId: succeeded.designId,
      requestedById: succeeded.requestedById,
      status: succeeded.status,
    });

    return succeeded;
  }

  private readOverlayPng(): Buffer {
    const path = join(process.cwd(), 'seed-assets/showcase/work-ring.png');
    return existsSync(path) ? readFileSync(path) : TINY_PNG;
  }

  private async getOwned(id: string, user: User): Promise<VisualizationJob> {
    const job = await this.prisma.visualizationJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException({ success: false, message: 'Visualization job not found' });
    }
    this.assertOwnerOrAdmin(job, user);
    return job;
  }

  async findOne(id: string, user: User): Promise<VisualizationJob> {
    return this.getOwned(id, user);
  }

  async findMany(user: User, query: QueryVisualizationJobsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const where = { requestedById: user.id };

    const [items, total] = await Promise.all([
      this.prisma.visualizationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.visualizationJob.count({ where }),
    ]);

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  async purgeExpired(): Promise<{ purgedJobs: number; softDeletedUploads: number }> {
    const now = new Date();
    const expired = await this.prisma.visualizationJob.findMany({
      where: { retentionExpiresAt: { lte: now } },
      select: { id: true, inputUploadId: true, outputUploadId: true },
    });

    if (expired.length === 0) {
      return { purgedJobs: 0, softDeletedUploads: 0 };
    }

    const uploadIds = Array.from(
      new Set(expired.flatMap((job) => [job.inputUploadId, job.outputUploadId].filter((id): id is string => !!id))),
    );

    const result = await this.prisma.upload.updateMany({
      where: { id: { in: uploadIds }, deletedAt: null },
      data: { deletedAt: now, status: UploadStatus.DELETED },
    });

    await this.audit.log({
      action: 'visualization_job.purge_expired',
      entityType: 'VisualizationJob',
      after: { purgedJobs: expired.length, softDeletedUploads: result.count },
    });

    return { purgedJobs: expired.length, softDeletedUploads: result.count };
  }
}
