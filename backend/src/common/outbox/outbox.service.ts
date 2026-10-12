import { Injectable, Logger } from '@nestjs/common';
import { OutboxEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Pass the caller's transaction client so the event commits (or rolls back) with its cause. */
  async enqueue(type: string, payload: Prisma.InputJsonValue, tx?: Prisma.TransactionClient): Promise<OutboxEvent> {
    const event = await (tx ?? this.prisma).outboxEvent.create({
      data: { type, payload },
    });
    this.logger.debug(`Enqueued outbox event ${type} (${event.id})`);
    return event;
  }
}
