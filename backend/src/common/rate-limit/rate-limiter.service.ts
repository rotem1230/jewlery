import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

type Window = { count: number; resetAt: number };

const SWEEP_EVERY = 500;

/**
 * Fixed-window counters for security-sensitive budgets (login attempts, mail-sending endpoints).
 * Uses Redis when configured so the budget is shared by every API instance; otherwise falls back
 * to process memory (correct for a single instance only — see docs/production-readiness.md).
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly memory = new Map<string, Window>();
  private writes = 0;

  constructor(private readonly redis: RedisService) {}

  /** Records one hit for `key`; returns false once more than `limit` hits fall in the window. */
  async consume(key: string, limit: number, windowMs: number): Promise<boolean> {
    const client = this.redis.isAvailable() ? this.redis.getClient() : null;
    if (client) {
      try {
        const redisKey = `ratelimit:${key}`;
        const result = await client
          .multi()
          .set(redisKey, '0', 'PX', windowMs, 'NX')
          .incr(redisKey)
          .exec();
        const count = Number(result?.[1]?.[1] ?? 0);
        return count <= limit;
      } catch (err) {
        this.logger.warn(`Redis rate limit failed, using in-process window: ${(err as Error).message}`);
      }
    }
    return this.consumeInMemory(key, limit, windowMs);
  }

  private consumeInMemory(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.writes += 1;
    if (this.writes % SWEEP_EVERY === 0) {
      for (const [k, w] of this.memory) {
        if (w.resetAt <= now) {
          this.memory.delete(k);
        }
      }
    }
    const current = this.memory.get(key);
    if (!current || current.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowMs });
      return limit >= 1;
    }
    current.count += 1;
    return current.count <= limit;
  }
}
