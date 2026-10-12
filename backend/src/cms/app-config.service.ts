import { Injectable, Logger } from '@nestjs/common';
import { AppConfig, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DEFAULT_APP_CONFIGS, PUBLIC_CONFIG_KEYS } from './app-config.constants';

const VERSION_POINTER_PREFIX = 'config:version:';
const VALUE_KEY_PREFIX = 'config:';

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private versionKey(key: string): string {
    return `${VERSION_POINTER_PREFIX}${key}`;
  }

  private valueKey(key: string, version: number): string {
    return `${VALUE_KEY_PREFIX}${key}:v${version}`;
  }

  async get(key: string): Promise<Prisma.JsonValue | undefined> {
    const cachedVersion = await this.redis.get(this.versionKey(key));
    if (cachedVersion) {
      const cached = await this.redis.getJson<{ value: Prisma.JsonValue }>(
        this.valueKey(key, Number(cachedVersion)),
      );
      if (cached) {
        return cached.value;
      }
    }

    const row = await this.prisma.appConfig.findUnique({ where: { key } });
    if (!row) {
      return undefined;
    }

    await this.cacheRow(row);
    return row.value;
  }

  async getMany(keys: string[]): Promise<Record<string, Prisma.JsonValue>> {
    const entries = await Promise.all(
      keys.map(async (key) => [key, await this.get(key)] as const),
    );
    const result: Record<string, Prisma.JsonValue> = {};
    for (const [key, value] of entries) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  async getAll(): Promise<AppConfig[]> {
    return this.prisma.appConfig.findMany({ orderBy: { key: 'asc' } });
  }

  async getPublicConfig(): Promise<Record<string, Prisma.JsonValue>> {
    return this.getMany([...PUBLIC_CONFIG_KEYS]);
  }

  async set(
    key: string,
    value: Prisma.InputJsonValue,
    userId?: string,
  ): Promise<AppConfig> {
    const existing = await this.prisma.appConfig.findUnique({ where: { key } });

    const row = existing
      ? await this.prisma.appConfig.update({
          where: { key },
          data: { value, version: { increment: 1 }, updatedBy: userId ?? null },
        })
      : await this.prisma.appConfig.create({
          data: { key, value, updatedBy: userId ?? null },
        });

    if (existing) {
      await this.redis.del(this.valueKey(key, existing.version));
    }
    await this.cacheRow(row);

    await this.audit.log({
      actorUserId: userId ?? null,
      action: existing ? 'config.update' : 'config.create',
      entityType: 'AppConfig',
      entityId: row.id,
      before: existing ? (existing.value as Prisma.InputJsonValue) : null,
      after: value,
    });

    return row;
  }

  async seedDefaults(): Promise<void> {
    for (const entry of DEFAULT_APP_CONFIGS) {
      const existing = await this.prisma.appConfig.findUnique({ where: { key: entry.key } });
      if (existing) {
        continue;
      }
      await this.prisma.appConfig.create({ data: { key: entry.key, value: entry.value } });
      this.logger.log(`Seeded default AppConfig: ${entry.key}`);
    }
  }

  private async cacheRow(row: AppConfig): Promise<void> {
    await this.redis.set(this.versionKey(row.key), String(row.version));
    await this.redis.setJson(this.valueKey(row.key, row.version), { value: row.value });
  }
}
