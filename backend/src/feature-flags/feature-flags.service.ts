import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { FeatureFlag, Prisma, User, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_KEY = 'feature-flags:all';
const CACHE_TTL_SECONDS = 30;

type FlagAudience = { roles?: UserRole[] };

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private async getAllFlags(): Promise<FeatureFlag[]> {
    const cached = await this.redis.getJson<FeatureFlag[]>(CACHE_KEY);
    if (cached) {
      return cached;
    }
    const flags = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    await this.redis.setJson(CACHE_KEY, flags, CACHE_TTL_SECONDS);
    return flags;
  }

  private async bustCache(): Promise<void> {
    await this.redis.del(CACHE_KEY);
  }

  private evaluate(flag: FeatureFlag, user?: Pick<User, 'id' | 'roles'>): boolean {
    if (!flag.enabled) {
      return false;
    }

    const audience = (flag.audience as FlagAudience | null) ?? null;
    if (audience?.roles && audience.roles.length > 0) {
      if (!user || !user.roles.some((role) => audience.roles!.includes(role))) {
        return false;
      }
    }

    if (flag.rolloutPct >= 100) {
      return true;
    }
    if (flag.rolloutPct <= 0) {
      return false;
    }

    const bucketSeed = user?.id ?? 'anonymous';
    const hash = createHash('sha1').update(`${flag.key}:${bucketSeed}`).digest('hex');
    const bucket = parseInt(hash.slice(0, 8), 16) % 100;
    return bucket < flag.rolloutPct;
  }

  async isEnabled(key: string, user?: Pick<User, 'id' | 'roles'>): Promise<boolean> {
    const flags = await this.getAllFlags();
    const flag = flags.find((f) => f.key === key);
    if (!flag) {
      return false;
    }
    return this.evaluate(flag, user);
  }

  async evaluateAll(user?: Pick<User, 'id' | 'roles'>): Promise<Record<string, boolean>> {
    const flags = await this.getAllFlags();
    const result: Record<string, boolean> = {};
    for (const flag of flags) {
      result[flag.key] = this.evaluate(flag, user);
    }
    return result;
  }

  async listAll(): Promise<FeatureFlag[]> {
    return this.getAllFlags();
  }

  async create(
    key: string,
    enabled: boolean,
    rolloutPct: number,
    roles: UserRole[] | undefined,
    actorUserId?: string,
  ): Promise<FeatureFlag> {
    const flag = await this.prisma.featureFlag.create({
      data: {
        key,
        enabled,
        rolloutPct,
        audience: roles && roles.length > 0 ? ({ roles } as Prisma.InputJsonValue) : undefined,
      },
    });
    await this.bustCache();
    await this.audit.log({
      actorUserId: actorUserId ?? null,
      action: 'feature_flag.create',
      entityType: 'FeatureFlag',
      entityId: flag.id,
      after: toJsonValue(flag),
    });
    return flag;
  }

  async update(
    key: string,
    changes: { enabled?: boolean; rolloutPct?: number; roles?: UserRole[] },
    actorUserId?: string,
  ): Promise<FeatureFlag> {
    const existing = await this.prisma.featureFlag.findUniqueOrThrow({ where: { key } });
    const flag = await this.prisma.featureFlag.update({
      where: { key },
      data: {
        enabled: changes.enabled,
        rolloutPct: changes.rolloutPct,
        audience:
          changes.roles !== undefined
            ? ({ roles: changes.roles } as Prisma.InputJsonValue)
            : undefined,
      },
    });
    await this.bustCache();
    await this.audit.log({
      actorUserId: actorUserId ?? null,
      action: 'feature_flag.update',
      entityType: 'FeatureFlag',
      entityId: flag.id,
      before: toJsonValue(existing),
      after: toJsonValue(flag),
    });
    return flag;
  }

  async remove(key: string, actorUserId?: string): Promise<void> {
    const existing = await this.prisma.featureFlag.findUniqueOrThrow({ where: { key } });
    await this.prisma.featureFlag.delete({ where: { key } });
    await this.bustCache();
    await this.audit.log({
      actorUserId: actorUserId ?? null,
      action: 'feature_flag.delete',
      entityType: 'FeatureFlag',
      entityId: existing.id,
      before: toJsonValue(existing),
    });
  }
}
