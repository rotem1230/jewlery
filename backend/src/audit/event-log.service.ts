import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class EventLogService {
  private readonly logger = new Logger(EventLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    eventKey: string,
    entityType: string,
    entityId: string,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      await this.prisma.eventLog.create({
        data: { eventKey, entityType, entityId, payload },
      });
    } catch (err) {
      this.logger.warn(`Failed to write event log ${eventKey}: ${(err as Error).message}`);
    }
  }
}
