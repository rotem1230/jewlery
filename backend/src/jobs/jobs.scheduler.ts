import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxProcessor } from '../common/outbox/outbox.processor';
import { SubscriptionLifecycleService } from '../subscriptions/subscription-lifecycle.service';
import { VisualizationService } from '../visualization/visualization.service';

const OUTBOX_MS = 2_000;
const SUBSCRIPTION_SWEEP_MS = 10 * 60 * 1000;
const VIZ_PURGE_MS = 60 * 60 * 1000;

/**
 * Process-local timers for the outbox drain, the subscription lifecycle sweep and the
 * visualization retention purge. Each job runs at most once at a time per process (a slow run is
 * never overlapped by the next tick); cross-instance safety comes from the jobs themselves
 * (outbox rows are claimed with SKIP LOCKED, sweeps use conditional updates).
 * Disabled with JOBS_ENABLED=false (tests drive the jobs directly).
 */
@Injectable()
export class JobsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsScheduler.name);
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private readonly running = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly outbox: OutboxProcessor,
    private readonly subscriptions: SubscriptionLifecycleService,
    private readonly visualization: VisualizationService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('jobs.enabled', true)) {
      this.logger.log('Background jobs disabled (JOBS_ENABLED=false)');
      return;
    }
    this.schedule('outbox', OUTBOX_MS, () => this.outbox.processPending(), true);
    this.schedule('subscriptions', SUBSCRIPTION_SWEEP_MS, () => this.subscriptions.runOnce(), true);
    this.schedule('viz-purge', VIZ_PURGE_MS, () => this.visualization.purgeExpired(), false);
  }

  onModuleDestroy(): void {
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers.length = 0;
  }

  private schedule(name: string, everyMs: number, job: () => Promise<unknown>, runNow: boolean): void {
    const tick = async () => {
      if (this.running.has(name)) {
        return;
      }
      this.running.add(name);
      try {
        await job();
      } catch (err) {
        this.logger.warn(`${name} job failed: ${(err as Error).message}`);
      } finally {
        this.running.delete(name);
      }
    };
    if (runNow) {
      void tick();
    }
    this.timers.push(setInterval(() => void tick(), everyMs));
  }
}
