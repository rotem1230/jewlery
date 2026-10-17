import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Design, JobStatus, Prisma, RenderJob, User, UserRole } from '@prisma/client';
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
import { lockUser } from '../database/row-locks';

const DEFAULT_PRIORITY = 100;
const PRIORITY_CLOUD_PROCESSING = 10;
const DEFAULT_DAILY_RENDERS_PER_USER = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How long POST /render-jobs waits for the export before answering with a job still running:
 * enough for an STL, well under the app's 15 s request timeout (an HD picture is then polled).
 */
const DEFAULT_SYNC_WAIT_MS = 8_000;
/** A job unfinished after this long was lost (e.g. the server restarted mid-render). */
const STALE_JOB_MS = 15 * 60 * 1000;
/** Export files are one-off downloads: they are deleted this long after the export. */
const OUTPUT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Formats the parametric engine produces; STEP needs a CAD kernel the platform does not have. */
const SUPPORTED_FORMATS = new Set(['STL', 'OBJ', 'PNG_HD']);

export type RenderJobView = RenderJob & { outputUrl: string | null };

@Injectable()
export class RenderJobsService implements OnModuleDestroy {
  private readonly logger = new Logger(RenderJobsService.name);
  /** Exports still rendering in the background (awaited on shutdown). */
  private readonly inFlight = new Set<Promise<unknown>>();

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

  /** RENDER_SYNC_WAIT_MS: how long POST /render-jobs waits for the file (read per app instance). */
  private readonly syncWaitMs = (() => {
    const raw = Number(process.env.RENDER_SYNC_WAIT_MS);
    return process.env.RENDER_SYNC_WAIT_MS && Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SYNC_WAIT_MS;
  })();

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
    const format = dto.exportFormat ?? 'STL';
    if (!SUPPORTED_FORMATS.has(format)) {
      throw new BadRequestException({
        success: false,
        message: `Export format ${format} is not available; use STL, OBJ or PNG_HD`,
        code: 'EXPORT_FORMAT_UNSUPPORTED',
      });
    }
    // High-resolution exports are a paid feature (PRD 5.10); STL and standard exports are not.
    if (dto.exportFormat === 'PNG_HD' && !user.roles.includes(UserRole.ADMIN)) {
      await this.entitlements.assert(user.id, 'hd_export');
    }

    const limit = await this.dailyLimit();
    const [hasPriority, hasNoWatermark] = await Promise.all([
      this.entitlements.has(user.id, 'priority_cloud_processing'),
      this.entitlements.has(user.id, 'no_watermark'),
    ]);

    // Count and create under the owner's row lock: simultaneous requests cannot all pass the
    // daily check (each job costs an engine run).
    let latestVersion = 1;
    const { design, job } = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, found.ownerUserId);
      // One export at a time per owner: each holds the render lane and tens of megabytes.
      const inFlight = await tx.renderJob.count({
        where: { design: { ownerUserId: found.ownerUserId }, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
      });
      if (inFlight > 0) {
        throw new ConflictException({
          success: false,
          message: 'An export is already being prepared; wait for it to finish',
          code: 'RENDER_IN_PROGRESS',
        });
      }
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
      latestVersion = version.versionNumber;
      const created = await tx.renderJob.create({
        data: {
          designId: found.id,
          designVersionId: version.id,
          status: JobStatus.QUEUED,
          priority: hasPriority ? PRIORITY_CLOUD_PROCESSING : DEFAULT_PRIORITY,
          exportFormat: format,
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

    // The export runs in the background; short ones (STL) finish within the wait and are answered
    // complete, long ones (HD pictures on a small server) are answered RUNNING and polled.
    // Caught here too: once the wait below has answered, nobody else would observe a rejection.
    const processing = this.process(job, design, latestVersion).catch((err: Error) => {
      this.logger.error(`Render job ${job.id} crashed: ${err.message}`, err.stack);
      return null;
    });
    this.inFlight.add(processing);
    void processing.finally(() => this.inFlight.delete(processing));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finished = await Promise.race([
      processing,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), this.syncWaitMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (finished) return this.view(finished);
    return this.view(await this.prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } }));
  }

  /** Runs the export and records the outcome; never throws (a failure is stored on the job). */
  private async process(job: RenderJob, design: Design, designVersion: number): Promise<RenderJob> {
    const started = await this.prisma.renderJob.updateMany({
      where: { id: job.id, status: JobStatus.QUEUED },
      data: { status: JobStatus.RUNNING, startedAt: new Date(), attempts: { increment: 1 } },
    });
    const running = await this.prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } });
    if (started.count !== 1) {
      // Cancelled (or swept) before it started: nothing to render.
      return running;
    }

    try {
      const result = await this.engine.render({
        renderJobId: running.id,
        designId: running.designId,
        designVersionId: running.designVersionId,
        designVersion,
        itemTypeId: design.itemTypeId,
        exportFormat: running.exportFormat,
        parameters: design.parameters,
        ownerUserId: design.ownerUserId,
        applyWatermark: running.applyWatermark,
      });
      if (!result.outputUploadId) {
        throw new Error('The render engine produced no file');
      }
      const outputUploadId = result.outputUploadId;

      // Only a job still running takes the result: one cancelled meanwhile keeps its status and the
      // file nobody will collect is withdrawn.
      const claimed = await this.prisma.renderJob.updateMany({
        where: { id: job.id, status: JobStatus.RUNNING },
        data: {
          status: JobStatus.SUCCEEDED,
          providerRef: result.providerRef,
          outputUploadId,
          finishedAt: new Date(),
        },
      });
      const succeeded = await this.prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } });
      if (claimed.count !== 1) {
        const output = await this.prisma.upload.findUnique({ where: { id: outputUploadId } });
        if (output) await this.uploads.discard(output);
        return succeeded;
      }

      await this.outbox.enqueue('render.completed', {
        renderJobId: succeeded.id,
        designId: succeeded.designId,
        status: succeeded.status,
      });

      return succeeded;
    } catch (err) {
      this.logger.error(`Render job ${job.id} failed: ${(err as Error).message}`, (err as Error).stack);
      await this.prisma.renderJob.updateMany({
        where: { id: job.id, status: JobStatus.RUNNING },
        data: {
          status: JobStatus.FAILED,
          errorMessage: 'Render failed',
          finishedAt: new Date(),
        },
      });
      return this.prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } });
    }
  }

  /**
   * Deletes export files older than the retention (a new export makes a fresh one any time), so
   * stored files do not pile up — they count toward the database's size with database storage.
   */
  async purgeOldOutputs(now: Date = new Date(), batchSize = 200): Promise<number> {
    const old = await this.prisma.renderJob.findMany({
      where: { outputUploadId: { not: null }, finishedAt: { lt: new Date(now.getTime() - OUTPUT_RETENTION_MS) } },
      select: { id: true, outputUploadId: true },
      take: batchSize,
    });
    let purged = 0;
    for (const job of old) {
      await this.prisma.renderJob.update({ where: { id: job.id }, data: { outputUploadId: null } });
      const upload = await this.prisma.upload.findFirst({ where: { id: job.outputUploadId!, deletedAt: null } });
      if (upload && !(await this.uploads.isReferencedElsewhere(upload.id))) {
        await this.uploads.discard(upload);
        purged++;
      }
    }
    return purged;
  }

  /** Graceful shutdown: running exports record their outcome before the app closes. */
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  /** Fails jobs left unfinished by a restart, so their owners can export again. */
  async failStaleJobs(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.renderJob.updateMany({
      where: {
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        createdAt: { lt: new Date(now.getTime() - STALE_JOB_MS) },
      },
      data: { status: JobStatus.FAILED, errorMessage: 'Render interrupted; please export again', finishedAt: now },
    });
    return count;
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

    // Conditional: a job that finished meanwhile keeps its result.
    const claimed = await this.prisma.renderJob.updateMany({
      where: { id, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
      data: { status: JobStatus.CANCELLED, finishedAt: new Date() },
    });
    const cancelled = await this.prisma.renderJob.findUniqueOrThrow({ where: { id } });
    if (claimed.count !== 1) {
      throw new BadRequestException({
        success: false,
        message: `Render job in status ${cancelled.status} cannot be cancelled`,
      });
    }

    await this.audit.log({
      actorUserId: user.id,
      action: 'render_job.cancel',
      entityType: 'RenderJob',
      entityId: id,
    });

    return cancelled;
  }
}
