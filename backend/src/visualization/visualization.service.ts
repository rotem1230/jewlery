import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Design, JobStatus, UploadStatus, User, UserRole, VisualizationJob } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { AppConfigService } from '../cms/app-config.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { lockUser } from '../database/row-locks';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { DEFAULT_PLACEMENT, MAX_PHOTO_SIDE, Placement, composite, decodePhoto, encodeJpeg, fitWithin } from '../jewelry/compose';
import { JewelryRenderService } from '../jewelry/jewelry-render.service';
import { encodePngAsync } from '../jewelry/png';
import { UploadAccessService } from '../uploads/upload-access.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreateVisualizationJobDto, QueryVisualizationJobsDto } from './dto/visualization.dto';

const PAGE_SIZE = 20;
const DEFAULT_RETENTION_HOURS = 72;
const VIZ_ENTITLEMENT_KEY = 'personal_visualization';
const VIZ_FLAG = 'phase2_visualization';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Pixels per side of the transparent picture the app places over the photo. */
export const OVERLAY_SIZE = 768;
const OVERLAY_CACHE = 16;

/**
 * Try-on: the designer places a transparent picture of their design (rendered from its
 * parameters) on a photo of their own; the server composes the same picture at that place, size
 * and angle into a new image. The selfie is never echoed back and is purged after retention.
 */
@Injectable()
export class VisualizationService {
  private readonly logger = new Logger(VisualizationService.name);
  /** Recent overlay pictures by design id + version (rendering one takes a moment). */
  private readonly overlays = new Map<string, Promise<Buffer>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly appConfig: AppConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly uploads: UploadsService,
    private readonly access: UploadAccessService,
    private readonly config: ConfigService,
    private readonly jewelry: JewelryRenderService,
  ) {}

  private view(job: VisualizationJob) {
    return { ...job, outputUrl: this.access.urlFor(job.outputUploadId) };
  }

  private assertOwnerOrAdmin(job: { requestedById: string }, user: User): void {
    if (job.requestedById !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the visualization job owner' });
    }
  }

  private async retentionHours(): Promise<number> {
    const raw = await this.appConfig.get('viz_retention_hours');
    return typeof raw === 'number' ? raw : DEFAULT_RETENTION_HOURS;
  }

  async create(user: User, dto: CreateVisualizationJobDto) {
    await this.assertTryOnAllowed(user);

    const design = await this.prisma.design.findFirst({ where: { id: dto.designId, deletedAt: null } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the design owner' });
    }

    const upload = await this.prisma.upload.findFirst({
      where: {
        id: dto.inputUploadId,
        ownerUserId: user.id,
        deletedAt: null,
        status: UploadStatus.READY,
        mimeType: { startsWith: 'image/' },
      },
    });
    if (!upload) {
      throw new BadRequestException({
        success: false,
        message: 'inputUploadId must reference an image uploaded by the current user',
      });
    }

    const hours = await this.retentionHours();
    const jobsPerDay = this.config.get<number>('visualization.jobsPerDay', 20);
    // Every job stores a generated image: a daily cap per user, serialized by the user's lock so
    // simultaneous requests cannot all pass the count.
    const job = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const startedToday = await tx.visualizationJob.count({
        where: { requestedById: user.id, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      if (startedToday >= jobsPerDay) {
        throw new HttpException(
          { success: false, message: 'Daily try-on limit reached', code: 'VISUALIZATION_QUOTA_EXCEEDED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return tx.visualizationJob.create({
        data: {
          designId: design.id,
          requestedById: user.id,
          inputUploadId: upload.id,
          status: JobStatus.QUEUED,
          retentionExpiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
        },
      });
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'visualization_job.create',
      entityType: 'VisualizationJob',
      entityId: job.id,
      after: toJsonValue(job),
    });

    return this.view(await this.process(job, design, upload.mimeType, user.id, dto.placement ?? DEFAULT_PLACEMENT));
  }

  /**
   * The transparent picture of the design the app shows over the photo while the designer places
   * it (the owner's own design only). The composed try-on uses this same picture.
   */
  async overlay(designId: string, user: User): Promise<Buffer> {
    // The same gates as a try-on: the overlay exists only to place one.
    await this.assertTryOnAllowed(user);
    const design = await this.prisma.design.findFirst({ where: { id: designId, deletedAt: null } });
    if (!design || (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN))) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    const key = `${design.id}:${design.version}`;
    let png = this.overlays.get(key);
    if (!png) {
      // One render per key, shared by simultaneous requests; a failure is not remembered.
      png = this.jewelry.cutout(design, OVERLAY_SIZE).then((image) => encodePngAsync(image));
      png.catch(() => this.overlays.delete(key));
      this.overlays.set(key, png);
      if (this.overlays.size > OVERLAY_CACHE) this.overlays.delete(this.overlays.keys().next().value as string);
    }
    return png;
  }

  private async assertTryOnAllowed(user: User): Promise<void> {
    if (!(await this.featureFlags.isEnabled(VIZ_FLAG, user))) {
      throw new ForbiddenException({ success: false, message: 'Visualization is not enabled', code: 'FEATURE_DISABLED' });
    }
    await this.entitlements.assert(user.id, VIZ_ENTITLEMENT_KEY);
  }

  /** Composes the design onto the photo as a distinct output upload (never echoes the input). */
  private async process(
    job: VisualizationJob,
    design: Design,
    mimeType: string,
    ownerUserId: string,
    placement: Placement,
  ): Promise<VisualizationJob> {
    let outputId: string;
    try {
      const bytes = await this.uploads.readBytes(job.inputUploadId);
      if (!bytes) throw new Error('The photo is no longer available');
      const photo = fitWithin(decodePhoto(bytes, mimeType), MAX_PHOTO_SIDE);
      const size = Math.round(Math.min(1600, Math.max(64, placement.scale * photo.width)));
      const piece = await this.jewelry.cutout(design, size);
      const output = await this.uploads.createGeneratedLocal(ownerUserId, encodeJpeg(composite(photo, piece, placement)), 'image/jpeg');
      outputId = output.id;
    } catch (err) {
      this.logger.warn(`Try-on ${job.id} failed: ${(err as Error).message}`);
      return this.prisma.visualizationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, errorMessage: 'Could not compose the try-on picture', finishedAt: new Date() },
      });
    }

    const succeeded = await this.prisma.visualizationJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.SUCCEEDED,
        outputUploadId: outputId,
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

  private async getOwned(id: string, user: User): Promise<VisualizationJob> {
    const job = await this.prisma.visualizationJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException({ success: false, message: 'Visualization job not found' });
    }
    this.assertOwnerOrAdmin(job, user);
    return job;
  }

  async findOne(id: string, user: User) {
    return this.view(await this.getOwned(id, user));
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
      items: items.map((job) => this.view(job)),
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  /**
   * Retention for personal photos: after `viz_retention_hours` the selfie and the generated
   * overlay are deleted from storage (not only flagged), stop being served, and the job is marked
   * purged so it is never processed again.
   */
  async purgeExpired(batchSize = 500): Promise<{ purgedJobs: number; softDeletedUploads: number }> {
    const now = new Date();
    const expired = await this.prisma.visualizationJob.findMany({
      where: { retentionExpiresAt: { lte: now }, purgedAt: null },
      select: { id: true, inputUploadId: true, outputUploadId: true },
      take: batchSize,
    });

    if (expired.length === 0) {
      return { purgedJobs: 0, softDeletedUploads: 0 };
    }

    const candidates = Array.from(
      new Set(expired.flatMap((job) => [job.inputUploadId, job.outputUploadId].filter((id): id is string => !!id))),
    );
    // A photo used as the try-on input may also be the avatar, a chat image, another try-on...:
    // only uploads nothing else refers to are deleted.
    const expiredJobIds = expired.map((job) => job.id);
    const uploadIds: string[] = [];
    for (const id of candidates) {
      if (!(await this.uploads.isReferencedElsewhere(id, expiredJobIds))) {
        uploadIds.push(id);
      }
    }

    const uploads = await this.prisma.upload.findMany({
      where: { id: { in: uploadIds } },
      select: { id: true, bucket: true, objectKey: true },
    });
    const result = await this.prisma.upload.updateMany({
      where: { id: { in: uploadIds }, deletedAt: null },
      data: { deletedAt: now, status: UploadStatus.DELETED },
    });
    for (const upload of uploads) {
      await this.uploads.deleteStoredFile(upload);
    }
    await this.prisma.visualizationJob.updateMany({
      where: { id: { in: expired.map((job) => job.id) } },
      data: { purgedAt: now },
    });

    await this.audit.log({
      action: 'visualization_job.purge_expired',
      entityType: 'VisualizationJob',
      after: { purgedJobs: expired.length, softDeletedUploads: result.count },
    });

    return { purgedJobs: expired.length, softDeletedUploads: result.count };
  }
}
