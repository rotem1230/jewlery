import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

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

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Claims a batch of unprocessed outbox events and dispatches in-app notifications
   * for frozen keys: quote.accepted, handoff.created, design.published,
   * design_request.delivered, notification.push, and *.completed.
   */
  async processPending(batchSize = 50): Promise<number> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    if (pending.length === 0) {
      return 0;
    }

    let processed = 0;
    for (const event of pending) {
      try {
        await this.dispatch(event.type, asRecord(event.payload));
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date(), attempts: { increment: 1 } },
        });
        processed += 1;
      } catch (err) {
        await this.prisma.outboxEvent
          .update({
            where: { id: event.id },
            data: {
              attempts: { increment: 1 },
              lastError: (err as Error).message,
            },
          })
          .catch(() => undefined);
        this.logger.warn(`Failed to process outbox event ${event.id}: ${(err as Error).message}`);
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
