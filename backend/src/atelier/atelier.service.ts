import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DesignRequestMode,
  DesignRequestStatus,
  DesignStatus,
  Prisma,
  ProfilePublishStatus,
  User,
  UserRole,
} from '@prisma/client';
import { AppConfigService } from '../cms/app-config.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { lockUser } from '../database/row-locks';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PUBLIC_PORTFOLIO_SELECT, toPublicJewelerProfile } from '../jeweler-profiles/public-profile';
import { CreateAtelierRequestDto, GeoSearchDto, QueryAtelierDesignsDto, QueryAtelierJewelersDto } from './dto/atelier.dto';

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const BANNER_PLACEMENT = 'atelier_banner';
const DESIGNS_FEED_PLACEMENT = 'atelier_designs_feed';
const MATCHING_FLAG = 'phase2_matching';
const PROMOTION_RANKER_FLAG = 'phase2_promotion_ranker';
const GEO_SEARCH_FLAG = 'phase3_postgis';
/**
 * Geo search must not reveal more than the published, rounded location (2 decimals, about 1 km):
 * distances are measured from the rounded point and the radius is whole kilometers, so shrinking
 * the radius around a guess cannot pinpoint a workshop.
 */
const MIN_GEO_RADIUS_KM = 1;
const DEFAULT_MATCHING_WEIGHTS = { regionMatchWeight: 50, specialtyOverlapWeight: 10 };
/** Requests a jeweler is still working on; a design is not delivered twice while one is open. */
const OPEN_REQUEST_STATUSES: DesignRequestStatus[] = [
  DesignRequestStatus.OPEN,
  DesignRequestStatus.QUOTE_SUBMITTED,
  DesignRequestStatus.NEGOTIATING,
];

/** What the public design feed exposes; reviewer ids, locks and acceptance data stay internal. */
const PUBLIC_DESIGN_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  ownerUserId: true,
  thumbnailUploadId: true,
  parameters: true,
  preferredRegionId: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  itemType: true,
  preferredRegion: true,
} satisfies Prisma.DesignSelect;

const PUBLIC_JEWELER_INCLUDE = {
  region: true,
  logoUpload: { select: { id: true, mimeType: true } },
  portfolio: { orderBy: { sortOrder: 'asc' }, take: 4, select: PUBLIC_PORTFOLIO_SELECT },
} satisfies Prisma.JewelerProfileInclude;

@Injectable()
export class AtelierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly appConfig: AppConfigService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly promotions: PromotionsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly config: ConfigService,
  ) {}

  private async getMatchingWeights(): Promise<typeof DEFAULT_MATCHING_WEIGHTS> {
    const raw = await this.appConfig.get('matching_weights');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      return {
        regionMatchWeight:
          typeof r.regionMatchWeight === 'number' ? r.regionMatchWeight : DEFAULT_MATCHING_WEIGHTS.regionMatchWeight,
        specialtyOverlapWeight:
          typeof r.specialtyOverlapWeight === 'number'
            ? r.specialtyOverlapWeight
            : DEFAULT_MATCHING_WEIGHTS.specialtyOverlapWeight,
      };
    }
    return DEFAULT_MATCHING_WEIGHTS;
  }

  /**
   * matchScore = (regionId matches the query's regionId ? regionMatchWeight : 0)
   *            + (count of overlapping specialties * specialtyOverlapWeight)
   * Purely additive vs. the existing response shape; stays 0 (Phase 1 stub behavior) unless
   * `phase2_matching` is enabled, per docs/backend-contracts.md.
   */
  private async computeMatchScores<T extends { regionId: string; specialties: string[] }>(
    rows: T[],
    query: QueryAtelierJewelersDto,
  ): Promise<number[]> {
    const enabled = await this.featureFlags.isEnabled(MATCHING_FLAG);
    if (!enabled) {
      return rows.map(() => 0);
    }

    const weights = await this.getMatchingWeights();
    const querySpecialties = query.specialties ?? [];

    return rows.map((row) => {
      const regionScore = query.regionId && row.regionId === query.regionId ? weights.regionMatchWeight : 0;
      const overlapCount = row.specialties.filter((s) => querySpecialties.includes(s)).length;
      return regionScore + overlapCount * weights.specialtyOverlapWeight;
    });
  }

  private async activeBanners() {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: { placement: BANNER_PLACEMENT, isActive: true, startAt: { lte: now }, endAt: { gte: now } },
      orderBy: { priority: 'desc' },
    });
  }

  async designs(query: QueryAtelierDesignsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const where: Prisma.DesignWhereInput = {
      status: DesignStatus.PUBLISHED,
      deletedAt: null,
      owner: { deletedAt: null },
    };
    if (query.regionId) {
      where.preferredRegionId = query.regionId;
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total, banners, rankerEnabled] = await Promise.all([
      this.prisma.design.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: PUBLIC_DESIGN_SELECT,
      }),
      this.prisma.design.count({ where }),
      this.activeBanners(),
      this.featureFlags.isEnabled(PROMOTION_RANKER_FLAG),
    ]);

    // Sprint 11: when the ranker flag is on, blend sponsored Promotion rows into the page and tag
    // each item `sponsored`; otherwise keep the Phase 1 behavior of only attaching page banners.
    const items = rankerEnabled ? await this.promotions.rankDesignResults(rows, DESIGNS_FEED_PLACEMENT) : rows;

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
      banners,
    };
  }

  async jewelers(query: QueryAtelierJewelersDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const where: Prisma.JewelerProfileWhereInput = {
      publishStatus: ProfilePublishStatus.PUBLISHED,
      user: { deletedAt: null },
    };
    if (query.regionId) {
      where.regionId = query.regionId;
    }
    if (query.q) {
      where.OR = [
        { businessName: { contains: query.q, mode: 'insensitive' } },
        { bio: { contains: query.q, mode: 'insensitive' } },
        { specialties: { has: query.q } },
      ];
    }

    const matchingEnabled = await this.featureFlags.isEnabled(MATCHING_FLAG);
    const orderBy: Prisma.JewelerProfileOrderByWithRelationInput =
      query.sort === 'newest' ? { createdAt: 'desc' } : { ratingAvg: 'desc' };

    if (matchingEnabled) {
      const rows = await this.prisma.jewelerProfile.findMany({
        where,
        orderBy,
        include: PUBLIC_JEWELER_INCLUDE,
      });
      const matchScores = await this.computeMatchScores(rows, query);
      const ranked = rows
        .map((row, i) => ({ ...toPublicJewelerProfile(row), matchScore: matchScores[i] }))
        .sort((a, b) => b.matchScore - a.matchScore || Number(b.ratingAvg) - Number(a.ratingAvg));
      const total = ranked.length;
      const items = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return {
        items,
        pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.jewelerProfile.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: PUBLIC_JEWELER_INCLUDE,
      }),
      this.prisma.jewelerProfile.count({ where }),
    ]);

    const matchScores = await this.computeMatchScores(rows, query);
    const items = rows.map((row, i) => ({ ...toPublicJewelerProfile(row), matchScore: matchScores[i] }));

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  async banners() {
    return this.activeBanners();
  }

  /**
   * Radius search gated by `phase3_postgis`. Uses haversine on stored lat/lng
   * (PostGIS-ready columns; ST_DWithin can replace this query when the extension is available).
   */
  async geoSearch(query: GeoSearchDto) {
    const enabled = await this.featureFlags.isEnabled(GEO_SEARCH_FLAG);
    if (!enabled) {
      throw new ForbiddenException({
        success: false,
        message: 'Geo search is not enabled',
        code: 'FEATURE_DISABLED',
      });
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const radiusKm = Math.max(MIN_GEO_RADIUS_KM, Math.ceil(query.radiusKm));
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM (
        SELECT id,
               round(latitude, 2)::double precision AS lat,
               round(longitude, 2)::double precision AS lng
          FROM jeweler_profiles
         WHERE "publishStatus" = 'PUBLISHED'
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
      ) AS published
      WHERE (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${query.lat})) * cos(radians(published.lat))
            * cos(radians(published.lng) - radians(${query.lng}))
            + sin(radians(${query.lat})) * sin(radians(published.lat))
          ))
        )
      ) <= ${radiusKm}
    `;
    const ids = rows.map((row) => row.id);
    const total = ids.length;
    const pageIds = ids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    if (pageIds.length === 0) {
      return {
        items: [],
        pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
      };
    }

    const profiles = await this.prisma.jewelerProfile.findMany({
      where: { id: { in: pageIds }, user: { deletedAt: null } },
      include: PUBLIC_JEWELER_INCLUDE,
    });
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    const ordered = pageIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row);
    const matchScores = await this.computeMatchScores(ordered, { page });
    const items = ordered.map((row, i) => ({ ...toPublicJewelerProfile(row), matchScore: matchScores[i] }));

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  async createRequest(user: User, dto: CreateAtelierRequestDto) {
    const design = await this.prisma.design.findFirst({ where: { id: dto.designId, deletedAt: null } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the design owner' });
    }
    if (design.status !== DesignStatus.PUBLISHED) {
      throw new ConflictException({
        success: false,
        message: 'Publish the design before requesting quotes',
        code: 'DESIGN_NOT_PUBLISHED',
      });
    }

    let targetProfileIds: string[];
    if (dto.mode === DesignRequestMode.TARGETED) {
      if (!dto.targetJewelerProfileIds || dto.targetJewelerProfileIds.length === 0) {
        throw new BadRequestException({
          success: false,
          message: 'targetJewelerProfileIds is required when mode is TARGETED',
        });
      }
      const profiles = await this.prisma.jewelerProfile.findMany({
        where: {
          id: { in: dto.targetJewelerProfileIds },
          publishStatus: ProfilePublishStatus.PUBLISHED,
        },
        select: { id: true },
      });
      if (profiles.length === 0) {
        throw new BadRequestException({
          success: false,
          message: 'None of the provided jeweler profiles are published',
        });
      }
      targetProfileIds = profiles.map((p) => p.id);
    } else {
      const fanout = this.config.get<number>('atelier.broadcastFanout', 50);
      const matchingEnabled = await this.featureFlags.isEnabled(MATCHING_FLAG);
      // A repeated broadcast reaches jewelers the earlier ones did not: those still holding an open
      // request for this design are not candidates.
      const profiles = await this.prisma.jewelerProfile.findMany({
        where: {
          publishStatus: ProfilePublishStatus.PUBLISHED,
          ...(!matchingEnabled && design.preferredRegionId ? { regionId: design.preferredRegionId } : {}),
          targets: { none: { request: { designId: design.id, status: { in: OPEN_REQUEST_STATUSES } } } },
        },
        select: { id: true, regionId: true, specialties: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: matchingEnabled ? 200 : fanout,
      });
      if (matchingEnabled) {
        const scores = await this.computeMatchScores(profiles, {
          regionId: design.preferredRegionId ?? undefined,
        });
        targetProfileIds = profiles
          .map((profile, i) => ({ id: profile.id, score: scores[i] }))
          .sort((a, b) => b.score - a.score)
          .slice(0, fanout)
          .map((row) => row.id);
      } else {
        targetProfileIds = profiles.map((p) => p.id);
      }
      if (targetProfileIds.length === 0 && (await this.hasOpenRequest(design.id))) {
        throw new ConflictException({
          success: false,
          message: 'Every jeweler this design can be broadcast to already has it',
          code: 'ALREADY_REQUESTED',
        });
      }
    }

    const enforceQuota = await this.leadQuotaEnforced();
    // Ordered by account, so simultaneous deliveries lock the jewelers' subscriptions in one order.
    const recipients = await this.prisma.jewelerProfile.findMany({
      where: { id: { in: targetProfileIds }, userId: { not: user.id }, user: { deletedAt: null } },
      select: { id: true, userId: true },
      orderBy: { userId: 'asc' },
    });

    const requestsPerDay = this.config.get<number>('atelier.requestsPerDay', 20);

    // One transaction: the request, the lead metering and the delivered targets succeed or fail
    // together (a refused request consumes no leads). The requester's lock makes the daily cap hold
    // under simultaneous requests; the design's lock does the same for the delivery rules below.
    const { request, deliveredProfileIds } = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      await tx.$queryRaw`SELECT id FROM "designs" WHERE id = ${design.id}::uuid FOR NO KEY UPDATE`;
      const sentToday = await tx.designRequest.count({
        where: { requesterId: user.id, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      if (sentToday >= requestsPerDay) {
        throw new HttpException(
          { success: false, message: 'Daily design request limit reached', code: 'REQUEST_QUOTA_EXCEEDED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // A jeweler gets a design once while a request for it is open, and is metered for it once:
      // after that request has closed, the design can reach them again without another lead.
      const reachedBefore = await tx.designRequestTarget.findMany({
        where: { jewelerProfileId: { in: recipients.map((r) => r.id) }, request: { designId: design.id } },
        select: { jewelerProfileId: true, request: { select: { status: true } } },
      });
      const holdingOpen = new Set(
        reachedBefore.filter((row) => OPEN_REQUEST_STATUSES.includes(row.request.status)).map((row) => row.jewelerProfileId),
      );
      const deliveredBefore = new Set(reachedBefore.map((row) => row.jewelerProfileId));
      const fresh = recipients.filter((recipient) => !holdingOpen.has(recipient.id));
      if (recipients.length > 0 && fresh.length === 0) {
        throw new ConflictException({
          success: false,
          message: 'These jewelers already received this design',
          code: 'ALREADY_REQUESTED',
        });
      }

      const created = await tx.designRequest.create({
        data: {
          designId: dto.designId,
          requesterId: user.id,
          mode: dto.mode,
          status: DesignRequestStatus.OPEN,
          message: dto.message ?? null,
        },
      });

      const delivered: string[] = [];
      for (const recipient of fresh) {
        if (deliveredBefore.has(recipient.id)) {
          // No second lead, but with enforcement on, still only to a jeweler who can receive requests.
          if (enforceQuota && !(await this.subscriptions.hasEntitledSubscription(tx, recipient.userId))) {
            continue;
          }
          delivered.push(recipient.id);
          continue;
        }
        const outcome = await this.subscriptions.consumeLeadForDelivery(tx, recipient.userId, created.id, enforceQuota);
        if (enforceQuota && (outcome === 'NO_LEADS' || outcome === 'NO_SUBSCRIPTION')) {
          continue;
        }
        delivered.push(recipient.id);
      }
      if (delivered.length === 0) {
        throw new ConflictException({
          success: false,
          message: 'None of the selected jewelers can receive requests right now',
          code: 'NO_ELIGIBLE_JEWELERS',
        });
      }
      await tx.designRequestTarget.createMany({
        data: delivered.map((jewelerProfileId) => ({ requestId: created.id, jewelerProfileId })),
      });
      const withTargets = await tx.designRequest.findUniqueOrThrow({
        where: { id: created.id },
        include: { targets: true },
      });
      return { request: withTargets, deliveredProfileIds: delivered };
    });

    await this.outbox.enqueue('design_request.delivered', {
      designRequestId: request.id,
      designId: request.designId,
      jewelerProfileIds: deliveredProfileIds,
    });

    return request;
  }

  private async hasOpenRequest(designId: string): Promise<boolean> {
    const open = await this.prisma.designRequestTarget.findFirst({
      where: { request: { designId, status: { in: OPEN_REQUEST_STATUSES } } },
      select: { requestId: true },
    });
    return !!open;
  }

  /** AppConfig lead_definition.enforceQuota: when true, jewelers without a lead are skipped. */
  private async leadQuotaEnforced(): Promise<boolean> {
    const raw = await this.appConfig.get('lead_definition');
    return !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).enforceQuota === true;
  }

  async findRequest(id: string, user: User) {
    const request = await this.prisma.designRequest.findUnique({
      where: { id },
      include: {
        design: { select: { id: true, title: true, ownerUserId: true, thumbnailUploadId: true } },
        targets: { include: { jewelerProfile: { select: { id: true, businessName: true, userId: true } } } },
        quotes: true,
      },
    });
    if (!request) {
      throw new NotFoundException({ success: false, message: 'Design request not found' });
    }

    const isRequester = request.requesterId === user.id;
    const isTargetedJeweler = request.targets.some((t) => t.jewelerProfile.userId === user.id);
    const isAdmin = user.roles.includes(UserRole.ADMIN);
    if (!isRequester && !isTargetedJeweler && !isAdmin) {
      throw new ForbiddenException({ success: false, message: 'Not authorized to view this request' });
    }

    // Competing jewelers see neither each other's prices nor who else received the request; the
    // requester sees every delivery and every quote.
    if (!isRequester && !isAdmin) {
      return {
        ...request,
        targets: request.targets.filter((target) => target.jewelerProfile.userId === user.id),
        quotes: request.quotes.filter((quote) => quote.authorUserId === user.id),
      };
    }
    return request;
  }
}
