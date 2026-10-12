import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { sqlTimestamp } from '../../database/sql-time';
import { NotificationsService } from '../../notifications/notifications.service';

/** After this many failed deliveries an event is dead-lettered (deadAt set) and never retried. */
export const OUTBOX_MAX_ATTEMPTS = 10;
/** A claimed event is invisible to other workers for this long (crash safety). */
const CLAIM_LEASE_MS = 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

type ClaimedEvent = { id: string; type: string; payload: Prisma.JsonValue; attempts: number };

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** 2s, 4s, 8s ... capped at 30 minutes. */
export function outboxBackoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(1, attempts));
}

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Claims a batch of due events with FOR UPDATE SKIP LOCKED and a lease, so concurrent workers
   * (several API instances, or overlapping ticks) never deliver the same event twice. Failures are
   * retried with exponential backoff; a failing event never blocks newer ones and is
   * dead-lettered after OUTBOX_MAX_ATTEMPTS.
   */
  async processPending(batchSize = 50): Promise<number> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
    // MATERIALIZED pins the locking SELECT to a single evaluation, so the leased rows are exactly the
    // rows that were locked. Dates go through sqlTimestamp: the columns hold UTC wall-clock time.
    const claimed = await this.prisma.$queryRaw<ClaimedEvent[]>`
      WITH due AS MATERIALIZED (
        SELECT "id" FROM "outbox_events"
         WHERE "processedAt" IS NULL
           AND "deadAt" IS NULL
           AND "nextAttemptAt" <= ${sqlTimestamp(now)}
           AND ("lockedUntil" IS NULL OR "lockedUntil" < ${sqlTimestamp(now)})
         ORDER BY "createdAt" ASC
         LIMIT ${batchSize}
         FOR UPDATE SKIP LOCKED
      )
      UPDATE "outbox_events" AS o
         SET "lockedUntil" = ${sqlTimestamp(leaseUntil)}
        FROM due
       WHERE o."id" = due."id"
      RETURNING o."id", o."type", o."payload", o."attempts"`;

    let processed = 0;
    for (const event of claimed) {
      try {
        await this.dispatch(event.type, asRecord(event.payload));
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date(), attempts: { increment: 1 }, lockedUntil: null, lastError: null },
        });
        processed += 1;
      } catch (err) {
        const attempts = event.attempts + 1;
        const dead = attempts >= OUTBOX_MAX_ATTEMPTS;
        await this.prisma.outboxEvent
          .update({
            where: { id: event.id },
            data: {
              attempts,
              lastError: (err as Error).message.slice(0, 1000),
              lockedUntil: null,
              nextAttemptAt: new Date(Date.now() + outboxBackoffMs(attempts)),
              deadAt: dead ? new Date() : null,
            },
          })
          .catch(() => undefined);
        this.logger.warn(
          `Outbox event ${event.id} (${event.type}) failed attempt ${attempts}${dead ? ' — dead-lettered' : ''}: ${(err as Error).message}`,
        );
      }
    }
    return processed;
  }

  private async dispatch(type: string, payload: Record<string, unknown>): Promise<void> {
    switch (type) {
      case 'quote.accepted':
        await this.notify(
          asString(payload.jewelerUserId),
          type,
          'Quote accepted',
          'A designer accepted your quote. Continue the WhatsApp handoff from the conversation.',
          payload,
        );
        return;
      case 'handoff.created':
        await this.notify(
          asString(payload.jewelerUserId),
          type,
          'Handoff ready',
          'WhatsApp handoff is ready for the accepted quote.',
          payload,
        );
        return;
      case 'design.published':
        await this.notify(
          asString(payload.ownerUserId),
          type,
          'Design published',
          'Your design is live in the Atelier marketplace.',
          payload,
        );
        return;
      case 'design_request.delivered':
        await this.notifyRequestTargets(payload);
        return;
      case 'notification.push':
        await this.notify(
          asString(payload.userId),
          asString(payload.eventKey) ?? type,
          asString(payload.title) ?? 'Notification',
          asString(payload.body) ?? '',
          payload,
        );
        return;
      default:
        if (type.endsWith('.completed')) {
          await this.notifyCompleted(type, payload);
        }
    }
  }

  private async notifyRequestTargets(payload: Record<string, unknown>): Promise<void> {
    const profileIds = asStringArray(payload.jewelerProfileIds);
    if (profileIds.length === 0) {
      return;
    }
    const profiles = await this.prisma.jewelerProfile.findMany({
      where: { id: { in: profileIds } },
      select: { userId: true },
    });
    for (const profile of profiles) {
      await this.notify(
        profile.userId,
        'design_request.delivered',
        'New design request',
        'A designer sent you a request to quote.',
        payload,
      );
    }
  }

  private async notifyCompleted(type: string, payload: Record<string, unknown>): Promise<void> {
    let userId = asString(payload.requestedById) ?? asString(payload.userId);
    if (!userId && asString(payload.aiJobId)) {
      const job = await this.prisma.aiGenerationJob.findUnique({
        where: { id: asString(payload.aiJobId)! },
        select: { requestedById: true },
      });
      userId = job?.requestedById;
    }
    if (!userId && asString(payload.renderJobId)) {
      const job = await this.prisma.renderJob.findUnique({
        where: { id: asString(payload.renderJobId)! },
        select: { design: { select: { ownerUserId: true } } },
      });
      userId = job?.design.ownerUserId;
    }
    const titles: Record<string, { title: string; body: string }> = {
      'ai.completed': { title: 'AI inspiration ready', body: 'Your inspiration model is ready to preview.' },
      'render.completed': { title: 'Export ready', body: 'Your render/export file is ready to download.' },
      'visualization.completed': { title: 'Try-on ready', body: 'Your visualization overlay is ready.' },
    };
    const copy = titles[type] ?? { title: 'Job completed', body: 'A background job finished.' };
    await this.notify(userId, type, copy.title, copy.body, payload);
  }

  private async notify(
    userId: string | undefined,
    eventKey: string,
    title: string,
    body: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!userId) {
      return;
    }
    await this.notifications.createInApp(userId, eventKey, title, body, payload as Prisma.InputJsonValue);
  }
}
