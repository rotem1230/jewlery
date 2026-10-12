import {
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
import { AiGenerationJob, JobStatus, User, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { AppConfigService } from '../cms/app-config.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { UploadAccessService } from '../uploads/upload-access.service';
import { UploadsService } from '../uploads/uploads.service';
import { AI_ENGINE_ADAPTER, AiEngineAdapter } from './adapters/ai-engine.adapter';
import { CreateAiInspirationDto } from './dto/ai.dto';

const GLB_MIME = 'model/gltf-binary';
const DEFAULT_DAILY_PER_USER = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Jobs stuck longer than this (e.g. the process restarted mid-generation) are failed. */
const STALE_JOB_MS = 15 * 60 * 1000;

export type AiJobView = AiGenerationJob & { outputUrl: string | null };

/**
 * Text-to-3D generation calls a paid provider and can take minutes, so it is asynchronous
 * (the request returns 202 with a QUEUED job that the app polls) and bounded per user: one job
 * in flight and a daily quota (AppConfig `ai_limits.dailyPerUser`).
 */
@Injectable()
export class AiService implements OnModuleDestroy {
  private readonly logger = new Logger(AiService.name);
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly uploads: UploadsService,
    private readonly access: UploadAccessService,
    private readonly appConfig: AppConfigService,
    @Inject(AI_ENGINE_ADAPTER)
    private readonly engine: AiEngineAdapter,
  ) {}

  private view(job: AiGenerationJob): AiJobView {
    return { ...job, outputUrl: this.access.urlFor(job.outputUploadId) };
  }

  private async dailyLimit(): Promise<number> {
    const raw = await this.appConfig.get('ai_limits');
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).dailyPerUser : null;
    return typeof value === 'number' && value >= 0 ? value : DEFAULT_DAILY_PER_USER;
  }

  async createInspiration(user: User, dto: CreateAiInspirationDto): Promise<AiJobView> {
    let itemCode = 'RING';
    if (dto.designId) {
      const design = await this.prisma.design.findFirst({
        where: { id: dto.designId, deletedAt: null },
        include: { itemType: { select: { code: true } } },
      });
      if (!design) {
        throw new NotFoundException({ success: false, message: 'Design not found' });
      }
      if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
        throw new ForbiddenException({ success: false, message: 'Not the design owner' });
      }
      itemCode = design.itemType.code;
    }

    const limit = await this.dailyLimit();
    const job = await this.prisma.$transaction(async (tx) => {
      // Per-user lock: the in-flight and daily checks cannot be raced by parallel requests.
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${user.id}::uuid FOR UPDATE`;
      const running = await tx.aiGenerationJob.count({
        where: { requestedById: user.id, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
      });
      if (running > 0) {
        throw new ConflictException({
          success: false,
          message: 'A generation is already in progress',
          code: 'AI_JOB_IN_PROGRESS',
        });
      }
      const today = await tx.aiGenerationJob.count({
        where: { requestedById: user.id, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      if (today >= limit) {
        throw new HttpException(
          { success: false, message: 'Daily generation limit reached', code: 'AI_QUOTA_EXCEEDED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return tx.aiGenerationJob.create({
        data: {
          designId: dto.designId ?? null,
          requestedById: user.id,
          prompt: dto.prompt,
          status: JobStatus.QUEUED,
        },
      });
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'ai.inspiration_request',
      entityType: 'AiGenerationJob',
      entityId: job.id,
      after: toJsonValue(job),
    });

    const work = this.process(job, itemCode, user.id).catch((err: Error) =>
      this.logger.error(`AI job ${job.id} crashed: ${err.message}`),
    );
    this.inFlight.add(work);
    void work.finally(() => this.inFlight.delete(work));

    return this.view(job);
  }

  /**
   * Adapter writes a GLB we host in Uploads. Provider URLs are downloaded immediately
   * (they expire) and never returned to the client.
   */
  private async process(job: AiGenerationJob, itemCode: string, ownerUserId: string): Promise<void> {
    // Every transition is conditional on the state this worker expects: once the stale sweep has
    // failed a job (and the user may have started another), a late result must not revive it.
    const started = await this.prisma.aiGenerationJob.updateMany({
      where: { id: job.id, status: JobStatus.QUEUED },
      data: { status: JobStatus.RUNNING },
    });
    if (started.count !== 1) {
      return;
    }
    try {
      const generated = await this.engine.generate({ prompt: job.prompt, itemCode });
      const upload = await this.uploads.createGeneratedLocal(ownerUserId, generated.glb, GLB_MIME);
      const finished = await this.prisma.aiGenerationJob.updateMany({
        where: { id: job.id, status: JobStatus.RUNNING },
        data: { status: JobStatus.SUCCEEDED, outputUploadId: upload.id, finishedAt: new Date() },
      });
      if (finished.count !== 1) {
        this.logger.warn(`AI job ${job.id} finished after it was given up; result discarded`);
        await this.uploads.discard(upload);
        return;
      }
      await this.outbox.enqueue('ai.completed', {
        aiJobId: job.id,
        designId: job.designId,
        status: JobStatus.SUCCEEDED,
        providerRef: generated.providerRef,
      });
    } catch (err) {
      this.logger.warn(`AI job ${job.id} failed: ${(err as Error).message}`);
      await this.prisma.aiGenerationJob.updateMany({
        where: { id: job.id, status: JobStatus.RUNNING },
        data: { status: JobStatus.FAILED, errorMessage: 'Generation failed', finishedAt: new Date() },
      });
    }
  }

  async findOne(id: string, user: User): Promise<AiJobView> {
    const job = await this.prisma.aiGenerationJob.findUnique({ where: { id } });
    if (!job || (job.requestedById !== user.id && !user.roles.includes(UserRole.ADMIN))) {
      throw new NotFoundException({ success: false, message: 'AI job not found' });
    }
    return this.view(job);
  }

  /** Fails jobs left QUEUED / RUNNING by a restart, so users are never blocked forever. */
  async failStaleJobs(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.aiGenerationJob.updateMany({
      where: {
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        createdAt: { lt: new Date(now.getTime() - STALE_JOB_MS) },
      },
      data: { status: JobStatus.FAILED, errorMessage: 'Generation timed out', finishedAt: now },
    });
    return result.count;
  }

  /** Graceful shutdown: let running generations record their outcome before the app closes. */
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }
}
