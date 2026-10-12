import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxProcessor } from '../common/outbox/outbox.processor';
import { VisualizationService } from '../visualization/visualization.service';

const OUTBOX_MS = 2_000;
const VIZ_PURGE_MS = 60 * 60 * 1000;

/**
 * Drains the transactional outbox and visualization retention sweep on a timer.
 * Process-local intervals always run so e2e (empty REDIS_URL) still delivers
 * notifications without requiring a live BullMQ worker.
 */
@Injectable()
export class JobsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsScheduler.name);
  private outboxTimer?: ReturnType<typeof setInterval>;
  private purgeTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly outbox: OutboxProcessor,
    private readonly visualization: VisualizationService,
  ) {}

  onModuleInit(): void {
    void this.drainOutbox();
    this.outboxTimer = setInterval(() => void this.drainOutbox(), OUTBOX_MS);
    this.purgeTimer = setInterval(() => {
      this.visualization
        .purgeExpired()
        .catch((err: Error) => this.logger.warn(`viz purge: ${err.message}`));
    }, VIZ_PURGE_MS);
  }

  onModuleDestroy(): void {
    if (this.outboxTimer) clearInterval(this.outboxTimer);
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  private async drainOutbox(): Promise<void> {
    try {
      await this.outbox.processPending();
    } catch (err) {
      this.logger.warn(`outbox drain: ${(err as Error).message}`);
    }
  }
}
