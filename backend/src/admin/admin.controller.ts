import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../authorization/decorators/roles.decorator';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('health-summary')
  async healthSummary() {
    const [databaseUp, redisUp, userCount, pendingOutboxCount, activeSubscriptionCount] =
      await Promise.all([
        this.prisma.ping(),
        this.redis.ping(),
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.outboxEvent.count({ where: { processedAt: null } }),
        this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      ]);

    return {
      database: { status: databaseUp ? 'up' : 'down' },
      redis: { status: redisUp ? 'up' : 'down' },
      stats: {
        users: userCount,
        pendingOutboxEvents: pendingOutboxCount,
        activeSubscriptions: activeSubscriptionCount,
      },
      checkedAt: new Date().toISOString(),
    };
  }
}
