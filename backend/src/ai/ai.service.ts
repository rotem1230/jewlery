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
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiGenerationJob, JobStatus, Prisma, User, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { AppConfigService } from '../cms/app-config.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { UploadAccessService } from '../uploads/upload-access.service';
import { UploadsService } from '../uploads/uploads.service';
import { AI_ENGINE_ADAPTER, AiEngineAdapter } from './adapters/ai-engine.adapter';
import { CreateAiInspirationDto } from './dto/ai.dto';
import { DesignChoices, describeChoices, loadChoiceCatalog } from './design-choices';
import { lockUser } from '../database/row-locks';
import { entitledSubscriptionWhere } from '../entitlements/entitlements.service';
import { billingCyclePeriodMs } from '../subscriptions/billing-periods';

const DEFAULT_DAILY_PER_USER = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The plan entitlement whose `limitValue` is the AI creations included per billing period. */
const AI_RENDERS = 'ai_renders';
/** Without a plan that sets them: the free designer plan's creations, over the last 30 days. */
const FREE_PLAN_CODE = 'DESIGNER_FREE';
const FREE_PLAN_WINDOW_MS = 30 * DAY_MS;
const DEFAULT_FREE_PLAN_RENDERS = 10;
/** Creations that use the quota: everything but a failed or cancelled one. */
const COUNTED_STATUSES = [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.SUCCEEDED];

type Tx = Prisma.TransactionClient;
/** Jobs stuck longer than this (e.g. the process restarted mid-generation) are failed. */
const STALE_JOB_MS = 15 * 60 * 1000;

export type AiJobView = AiGenerationJob & { outputUrl: string | null };

/** Pictures the provider can read (the app sends JPEG / PNG photos). */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Inspiration pictures (PRD 5.4 step 7: "generate using AI"), made from the note and from the
 * design's inspiration picture when there is one, by a paid provider. Asynchronous (the request
 * returns 202 with a QUEUED job that the app polls) and bounded per user: one job in flight, the
 * creations the user's plan includes for its billing period (`ai_renders`), and a daily quota
 * (AppConfig `ai_limits.dailyPerUser`). Without a configured provider the request is
 * refused up front. The app saves a finished picture as the design's inspiration picture.
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

  /**
   * The AI creations the user may make now, and since when they are counted: those of the plan
   * they are entitled to (its `ai_renders` cap, over the billing period that holds now), else the
   * free designer plan's (over the last 30 days). A plan whose cap is null has none.
   */
  private async planQuota(tx: Tx, userId: string, now: Date): Promise<{ limit: number | null; since: Date }> {
    const subscriptions = await tx.subscription.findMany({
      where: entitledSubscriptionWhere(userId, now),
      orderBy: { createdAt: 'desc' },
      include: { plan: { include: { entitlements: { include: { entitlement: true } } } } },
    });
    for (const sub of subscriptions) {
      const cap = sub.plan.entitlements.find((row) => row.entitlement.key === AI_RENDERS);
      if (cap) {
        // A renewal paid early starts the next period in the future: count the one that holds now.
        const since =
          sub.currentPeriodStart <= now
            ? sub.currentPeriodStart
            : new Date(sub.currentPeriodStart.getTime() - billingCyclePeriodMs(sub.billingCycle));
        return { limit: cap.limitValue, since };
      }
    }
    const free = await tx.planEntitlement.findFirst({
      where: { plan: { code: FREE_PLAN_CODE }, entitlement: { key: AI_RENDERS } },
    });
    return {
      limit: free ? free.limitValue : DEFAULT_FREE_PLAN_RENDERS,
      since: new Date(now.getTime() - FREE_PLAN_WINDOW_MS),
    };
  }

  async createInspiration(user: User, dto: CreateAiInspirationDto): Promise<AiJobView> {
    if (!this.engine.isConfigured()) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'AI generation is not available right now',
        code: 'AI_NOT_CONFIGURED',
      });
    }
    let itemCode = 'RING';
    let imageUploadId: string | null = null;
    let choices: DesignChoices | undefined;
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
      imageUploadId = await this.inspirationImage(design.ownerUserId, design.parameters);
      // The picture follows what the design is made of (metal, stones, setting…).
      choices = describeChoices(design.parameters, await loadChoiceCatalog(this.prisma));
    }

    const limit = await this.dailyLimit();
    const job = await this.prisma.$transaction(async (tx) => {
      // Per-user lock: the in-flight and daily checks cannot be raced by parallel requests.
      await lockUser(tx, user.id);
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
      const quota = await this.planQuota(tx, user.id, new Date());
      if (quota.limit !== null) {
        const used = await tx.aiGenerationJob.count({
          where: { requestedById: user.id, status: { in: COUNTED_STATUSES }, createdAt: { gte: quota.since } },
        });
        if (used >= quota.limit) {
          throw new HttpException(
            {
              success: false,
              message: 'The AI creations your plan includes for this period are used up',
              code: 'AI_PLAN_QUOTA_EXCEEDED',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
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

    const work = this.process(job, itemCode, user.id, imageUploadId, choices).catch((err: Error) =>
      this.logger.error(`AI job ${job.id} crashed: ${err.message}`),
    );
    this.inFlight.add(work);
    void work.finally(() => this.inFlight.delete(work));

    return this.view(job);
  }

  /**
   * The design's inspiration picture (`parameters.inspirationUploadId`) when it is a picture the
   * design's owner uploaded; anything else in that field is ignored.
   */
  private async inspirationImage(ownerUserId: string, parameters: unknown): Promise<string | null> {
    const id = (parameters as { inspirationUploadId?: unknown } | null)?.inspirationUploadId;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const upload = await this.prisma.upload.findFirst({
      where: { id, ownerUserId, deletedAt: null, status: 'READY' },
      select: { id: true, mimeType: true },
    });
    return upload && IMAGE_TYPES.has(upload.mimeType) ? upload.id : null;
  }

  /** The adapter returns the picture's bytes, which are stored as an upload of the requester. */
  private async process(
    job: AiGenerationJob,
    itemCode: string,
    ownerUserId: string,
    imageUploadId: string | null,
    choices?: DesignChoices,
  ): Promise<void> {
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
      let image: { bytes: Buffer; mimeType: string } | undefined;
      if (imageUploadId) {
        const upload = await this.prisma.upload.findUnique({ where: { id: imageUploadId }, select: { mimeType: true } });
        const bytes = await this.uploads.readBytes(imageUploadId);
        if (upload && bytes) image = { bytes, mimeType: upload.mimeType };
      }
      const generated = await this.engine.generate({ prompt: job.prompt, itemCode, image, choices });
      const upload = await this.uploads.createGeneratedLocal(ownerUserId, generated.image, generated.mimeType);
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
