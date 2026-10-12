import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private available = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('redisUrl');
    if (!url) {
      this.logger.warn('REDIS_URL not configured; caching disabled (no-op mode)');
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    });

    this.client.on('connect', () => {
      this.available = true;
      this.logger.log('Redis connected');
    });

    this.client.on('error', (err) => {
      if (this.available) {
        this.logger.warn(`Redis error: ${err.message}`);
      }
      this.available = false;
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('redisUrl'));
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable() || !this.client) {
      return null;
    }
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn(`get(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable() || !this.client) {
      return;
    }
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.warn(`set(${key}) failed: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isAvailable() || !this.client) {
      return;
    }
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`del(${key}) failed: ${(err as Error).message}`);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  getClient(): Redis | null {
    return this.client;
  }
}
