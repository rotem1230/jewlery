import { AppConfigService } from './app-config.service';

/** In-memory Redis stand-in that honours expiry. */
class FakeRedis {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();
  now = 0;

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    return entry && entry.expiresAt > this.now ? entry.value : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, { value, expiresAt: ttlSeconds ? this.now + ttlSeconds * 1000 : Number.POSITIVE_INFINITY });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }
}

/**
 * Regression: cached config never expired, so a value changed outside the service (a migration,
 * an operator's SQL fix) was never seen while Redis kept the old version pointer.
 */
describe('AppConfigService cache', () => {
  it('picks up a value changed directly in the database within the cache lifetime', async () => {
    const row = { id: 'c1', key: 'upload_limits', value: { maxBytes: 1 }, version: 1 };
    const prisma = { appConfig: { findUnique: jest.fn(async () => ({ ...row })) } };
    const redis = new FakeRedis();
    const service = new AppConfigService(prisma as never, redis as never, {} as never);

    expect(await service.get('upload_limits')).toEqual({ maxBytes: 1 });

    row.value = { maxBytes: 2 };
    row.version = 2;
    redis.now += 10 * 60 * 1000;

    expect(await service.get('upload_limits')).toEqual({ maxBytes: 2 });
  });
});
