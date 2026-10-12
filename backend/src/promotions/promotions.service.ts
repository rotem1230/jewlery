import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Promotion, PromotionEntityType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { AppConfigService } from '../cms/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

export type RankingWeights = { organicWeight: number; sponsoredWeight: number };
export type PromotionCaps = { maxSponsoredPerPage: number; maxSponsoredRatio: number };
export type SponsoredFeedItem = Promotion & { sponsored: true };
export type BlendedResult = { id: string; sponsored: boolean };

const DEFAULT_RANKING_WEIGHTS: RankingWeights = { organicWeight: 1, sponsoredWeight: 1.5 };
const DEFAULT_PROMOTION_CAPS: PromotionCaps = { maxSponsoredPerPage: 3, maxSponsoredRatio: 0.34 };

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async activeForPlacement(placement: string, entityType?: PromotionEntityType): Promise<Promotion[]> {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        placement,
        isActive: true,
        startAt: { lte: now },
        endAt: { gte: now },
        ...(entityType ? { entityType } : {}),
      },
      orderBy: { priority: 'desc' },
    });
  }

  /** Public feed: every returned item is sponsored by definition, so `sponsored: true` is always attached. */
  async feed(placement: string): Promise<SponsoredFeedItem[]> {
    const promotions = await this.activeForPlacement(placement);
    return promotions.map((promotion) => ({ ...promotion, sponsored: true as const }));
  }

  async getRankingWeights(): Promise<RankingWeights> {
    const raw = await this.appConfig.get('ranking_weights');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      return {
        organicWeight: typeof r.organicWeight === 'number' ? r.organicWeight : DEFAULT_RANKING_WEIGHTS.organicWeight,
        sponsoredWeight:
          typeof r.sponsoredWeight === 'number' ? r.sponsoredWeight : DEFAULT_RANKING_WEIGHTS.sponsoredWeight,
      };
    }
    return DEFAULT_RANKING_WEIGHTS;
  }

  async getPromotionCaps(): Promise<PromotionCaps> {
    const raw = await this.appConfig.get('promotion_caps');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      return {
        maxSponsoredPerPage:
          typeof r.maxSponsoredPerPage === 'number'
            ? r.maxSponsoredPerPage
            : DEFAULT_PROMOTION_CAPS.maxSponsoredPerPage,
        maxSponsoredRatio:
          typeof r.maxSponsoredRatio === 'number' ? r.maxSponsoredRatio : DEFAULT_PROMOTION_CAPS.maxSponsoredRatio,
      };
    }
    return DEFAULT_PROMOTION_CAPS;
  }

  /**
   * Blends an organically-ranked id list with sponsored promotion entries. Sponsored ids are
   * selected by `priority * sponsoredWeight`, capped by both `maxSponsoredPerPage` and
   * `maxSponsoredRatio * organicIds.length`, then placed ahead of the (deduped) organic order.
   * Pure function — does not fetch anything — so it is unit-testable in isolation.
   */
  blendOrganicAndSponsored(
    organicIds: string[],
    promotions: Promotion[],
    weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
    caps: PromotionCaps = DEFAULT_PROMOTION_CAPS,
  ): BlendedResult[] {
    const maxSponsored = Math.max(
      0,
      Math.min(caps.maxSponsoredPerPage, Math.floor(organicIds.length * caps.maxSponsoredRatio), promotions.length),
    );

    const sponsoredIds = [...promotions]
      .sort((a, b) => b.priority * weights.sponsoredWeight - a.priority * weights.sponsoredWeight)
      .slice(0, maxSponsored)
      .map((promotion) => promotion.entityId)
      .filter((id) => organicIds.includes(id));

    // organicWeight is reserved for future relevance-score blending; today organic order is preserved as-is.
    const sponsoredSet = new Set(sponsoredIds);
    const organicWithoutSponsored = organicIds.filter((id) => !sponsoredSet.has(id));

    return [
      ...sponsoredIds.map((id) => ({ id, sponsored: true })),
      ...organicWithoutSponsored.map((id) => ({ id, sponsored: false })),
    ];
  }

  /** Reorders + tags an already-fetched page of designs using the promotion ranker for `placement`. */
  async rankDesignResults<T extends { id: string }>(items: T[], placement: string): Promise<(T & { sponsored: boolean })[]> {
    if (items.length === 0) {
      return [];
    }
    const [promotions, weights, caps] = await Promise.all([
      this.activeForPlacement(placement, PromotionEntityType.DESIGN),
      this.getRankingWeights(),
      this.getPromotionCaps(),
    ]);

    const organicIds = items.map((item) => item.id);
    const blended = this.blendOrganicAndSponsored(organicIds, promotions, weights, caps);
    const byId = new Map(items.map((item) => [item.id, item]));

    return blended
      .map((entry) => {
        const item = byId.get(entry.id);
        return item ? { ...item, sponsored: entry.sponsored } : undefined;
      })
      .filter((item): item is T & { sponsored: boolean } => item !== undefined);
  }

  // ---------------------------------------------------------------------
  // Admin CRUD
  // ---------------------------------------------------------------------

  adminList() {
    return this.prisma.promotion.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] });
  }

  private async getOrThrow(id: string): Promise<Promotion> {
    const promotion = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promotion) {
      throw new NotFoundException({ success: false, message: 'Promotion not found' });
    }
    return promotion;
  }

  async adminCreate(dto: CreatePromotionDto, actorUserId?: string): Promise<Promotion> {
    const promotion = await this.prisma.promotion.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        placement: dto.placement,
        source: dto.source,
        priority: dto.priority ?? 0,
        budget: dto.budget,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        isActive: dto.isActive ?? true,
        meta: dto.meta !== undefined ? (toJsonValue(dto.meta) as Prisma.InputJsonValue) : undefined,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'promotion.create',
      entityType: 'Promotion',
      entityId: promotion.id,
      after: toJsonValue(promotion),
    });

    return promotion;
  }

  async adminUpdate(id: string, dto: UpdatePromotionDto, actorUserId?: string): Promise<Promotion> {
    const existing = await this.getOrThrow(id);

    const promotion = await this.prisma.promotion.update({
      where: { id },
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        placement: dto.placement,
        source: dto.source,
        priority: dto.priority,
        budget: dto.budget,
        startAt: dto.startAt !== undefined ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt !== undefined ? new Date(dto.endAt) : undefined,
        isActive: dto.isActive,
        meta: dto.meta !== undefined ? (toJsonValue(dto.meta) as Prisma.InputJsonValue) : undefined,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'promotion.update',
      entityType: 'Promotion',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(promotion),
    });

    return promotion;
  }

  async adminRemove(id: string, actorUserId?: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.prisma.promotion.delete({ where: { id } });

    await this.audit.log({
      actorUserId,
      action: 'promotion.delete',
      entityType: 'Promotion',
      entityId: id,
      before: toJsonValue(existing),
    });
  }
}
