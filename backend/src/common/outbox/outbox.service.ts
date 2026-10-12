import { Injectable, Logger } from '@nestjs/common';
import { OutboxEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(type: string, payload: Prisma.InputJsonValue): Promise<OutboxEvent> {
    const event = await this.prisma.outboxEvent.create({
      data: { type, payload },
    });
    this.logger.debug(`Enqueued outbox event ${type} (${event.id})`);
    return event;
  }
}
