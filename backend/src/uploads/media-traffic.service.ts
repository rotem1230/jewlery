import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Media traffic per file owner and day (the traffic cost per user in the admin reports). Counted
 * after the response is sent, never delaying or failing it.
 */
@Injectable()
export class MediaTrafficService {
  private readonly logger = new Logger(MediaTrafficService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(ownerUserId: string, bytes: number): Promise<void> {
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "media_traffic_daily" ("ownerUserId", "day", "bytes", "requests")
        VALUES (${ownerUserId}::uuid, (timezone('UTC', now()))::date, ${BigInt(Math.round(bytes))}, 1)
        ON CONFLICT ("ownerUserId", "day")
        DO UPDATE SET "bytes" = "media_traffic_daily"."bytes" + EXCLUDED."bytes",
                      "requests" = "media_traffic_daily"."requests" + 1`;
    } catch (err) {
      // Deliberately not rethrown: counting must never fail or delay serving the file.
      this.logger.warn(`Media traffic of ${ownerUserId} not counted: ${(err as Error).message}`);
    }
  }
}
