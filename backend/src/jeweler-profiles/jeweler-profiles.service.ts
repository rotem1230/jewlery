import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DesignRequestStatus,
  JewelerOnboardingDraft,
  JewelerProfile,
  Prisma,
  ProfilePublishStatus,
  User,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { AppConfigService } from '../cms/app-config.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { UploadAccessService } from '../uploads/upload-access.service';
import { UploadsService } from '../uploads/uploads.service';
import { PUBLIC_PORTFOLIO_SELECT, PUBLIC_REVIEW_SELECT, toPublicJewelerProfile } from './public-profile';
import {
  CreateCrmNoteDto,
  CreatePortfolioItemDto,
  OrdersTab,
  QueryOrdersDto,
  UpdateCrmNoteDto,
  UpdatePortfolioItemDto,
  UpsertJewelerDraftDto,
} from './dto/jeweler-profile.dto';

const PAGE_SIZE = 20;
const CRM_ENTITLEMENT_KEY = 'jeweler_crm';

@Injectable()
export class JewelerProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly stateMachine: StateMachineService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly uploads: UploadsService,
    private readonly access: UploadAccessService,
  ) {}

  private async getOwnProfile(userId: string): Promise<JewelerProfile> {
    const profile = await this.prisma.jewelerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException({ success: false, message: 'Jeweler profile not found' });
    }
    return profile;
  }

  /** The owner's own profile, with signed URLs for its (possibly not yet public) media. */
  async me(userId: string) {
    const profile = await this.prisma.jewelerProfile.findUnique({
      where: { userId },
      include: {
        region: true,
        logoUpload: { select: { id: true, mimeType: true } },
        portfolio: { orderBy: { sortOrder: 'asc' }, include: { upload: { select: { id: true, mimeType: true } } } },
        reviews: {
          where: { isFeatured: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: PUBLIC_REVIEW_SELECT,
        },
      },
    });
    if (!profile) {
      return null;
    }
    return {
      ...profile,
      logoUpload: profile.logoUpload ? this.access.withUrl(profile.logoUpload) : null,
      logoUrl: this.access.urlFor(profile.logoUploadId),
      portfolio: profile.portfolio.map((item) => ({
        ...item,
        upload: this.access.withUrl(item.upload),
        contentUrl: this.access.signedContentPath(item.uploadId),
      })),
    };
  }

  // JewelerOnboardingDraft.userId is indexed but not a unique column, so upsert-by-user is manual.
  private async findDraftByUser(userId: string): Promise<JewelerOnboardingDraft | null> {
    return this.prisma.jewelerOnboardingDraft.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async upsertDraft(userId: string, dto: UpsertJewelerDraftDto): Promise<JewelerOnboardingDraft> {
    if (dto.regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: dto.regionId } });
      if (!region) {
        throw new NotFoundException({ success: false, message: 'Unknown region' });
      }
    }

    if (dto.logoUploadId) {
      await this.uploads.assertOwnedImage(dto.logoUploadId, userId, 'logoUploadId');
    }

    const payload = toJsonValue(dto.payload);
    const existing = await this.findDraftByUser(userId);

    if (existing) {
      return this.prisma.jewelerOnboardingDraft.update({
        where: { id: existing.id },
        data: {
          payload,
          regionId: dto.regionId,
          logoUploadId: dto.logoUploadId,
        },
      });
    }

    return this.prisma.jewelerOnboardingDraft.create({
      data: {
        userId,
        payload,
        regionId: dto.regionId ?? null,
        logoUploadId: dto.logoUploadId ?? null,
      },
    });
  }

  private async getDraft(userId: string): Promise<JewelerOnboardingDraft> {
    const draft = await this.findDraftByUser(userId);
    if (!draft) {
      throw new NotFoundException({
        success: false,
        message: 'No onboarding draft found; save a draft first',
      });
    }
    return draft;
  }

  async preview(userId: string) {
    const draft = await this.getDraft(userId);
    const payload = (draft.payload ?? {}) as Record<string, unknown>;
    const regionId = draft.regionId ?? (payload.regionId as string | undefined);

    if (!payload.businessName) {
      throw new BadRequestException({ success: false, message: 'businessName is required for preview' });
    }
    if (!regionId) {
      throw new BadRequestException({ success: false, message: 'regionId is required for preview' });
    }

    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) {
      throw new NotFoundException({ success: false, message: 'Unknown region' });
    }

    await this.prisma.jewelerOnboardingDraft.update({
      where: { id: draft.id },
      data: {
        payload: toJsonValue({ ...payload, _previewReadyAt: new Date().toISOString() }),
      },
    });

    return {
      publishStatus: ProfilePublishStatus.PREVIEW_READY,
      businessName: payload.businessName,
      specialties: payload.specialties ?? [],
      bio: payload.bio ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      businessHours: payload.businessHours ?? null,
      serviceAreaText: payload.serviceAreaText ?? null,
      region,
      logoUploadId: draft.logoUploadId,
      portfolio: [] as unknown[],
    };
  }

  async publish(user: User): Promise<JewelerProfile> {
    if (!user.roles.includes(UserRole.JEWELER)) {
      throw new ForbiddenException({ success: false, message: 'Only jeweler accounts can publish a business profile' });
    }
    const draft = await this.getDraft(user.id);
    const payload = (draft.payload ?? {}) as Record<string, unknown>;
    const regionId = draft.regionId ?? (payload.regionId as string | undefined);
    const businessName = payload.businessName as string | undefined;
    const phone = payload.phone as string | undefined;

    const missing: string[] = [];
    if (!businessName) missing.push('businessName');
    if (!regionId) missing.push('regionId');
    if (!phone) missing.push('phone');
    if (missing.length > 0) {
      throw new BadRequestException({
        success: false,
        message: `Missing required fields to publish: ${missing.join(', ')}`,
        code: 'PROFILE_INCOMPLETE',
      });
    }

    const region = await this.prisma.region.findUnique({ where: { id: regionId as string } });
    if (!region) {
      throw new NotFoundException({ success: false, message: 'Unknown region' });
    }

    const requireApproval =
      (await this.appConfig.get('require_admin_approval_before_profile_publish')) === true;
    const target = requireApproval ? ProfilePublishStatus.PENDING_REVIEW : ProfilePublishStatus.PUBLISHED;

    const existing = await this.prisma.jewelerProfile.findUnique({ where: { userId: user.id } });
    const currentStatus = existing?.publishStatus ?? ProfilePublishStatus.DRAFT;
    this.stateMachine.assertReachable(this.stateMachine.profilePublishGraph, currentStatus, target);

    const businessHours = payload.businessHours as Prisma.InputJsonValue | undefined;
    const latitude = asOptionalCoord(payload.latitude) ?? existing?.latitude ?? null;
    const longitude = asOptionalCoord(payload.longitude) ?? existing?.longitude ?? null;

    const data = {
      businessName: businessName as string,
      regionId: regionId as string,
      specialties: (payload.specialties as string[] | undefined) ?? [],
      bio: (payload.bio as string | undefined) ?? null,
      phone: phone as string,
      email: (payload.email as string | undefined) ?? null,
      businessHours,
      serviceAreaText: (payload.serviceAreaText as string | undefined) ?? null,
      logoUploadId: draft.logoUploadId,
      publishStatus: target,
      publishedAt: target === ProfilePublishStatus.PUBLISHED ? new Date() : (existing?.publishedAt ?? null),
      latitude,
      longitude,
    };

    const profile = existing
      ? await this.prisma.jewelerProfile.update({ where: { userId: user.id }, data })
      : await this.prisma.jewelerProfile.create({ data: { userId: user.id, ...data } });

    await this.audit.log({
      actorUserId: user.id,
      action: 'jeweler_profile.publish',
      entityType: 'JewelerProfile',
      entityId: profile.id,
      before: existing ? toJsonValue(existing) : null,
      after: toJsonValue(profile),
    });

    return profile;
  }

  async findPublic(id: string) {
    const profile = await this.prisma.jewelerProfile.findFirst({
      where: { id, publishStatus: ProfilePublishStatus.PUBLISHED, user: { deletedAt: null } },
      include: {
        region: true,
        logoUpload: { select: { id: true, mimeType: true } },
        portfolio: { orderBy: { sortOrder: 'asc' }, select: PUBLIC_PORTFOLIO_SELECT },
        reviews: {
          where: { isFeatured: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: PUBLIC_REVIEW_SELECT,
        },
      },
    });
    if (!profile) {
      throw new NotFoundException({ success: false, message: 'Jeweler profile not found' });
    }
    return toPublicJewelerProfile(profile);
  }

  async orders(userId: string, query: QueryOrdersDto) {
    const profile = await this.getOwnProfile(userId);
    const page = query.page && query.page > 0 ? query.page : 1;
    const tab: OrdersTab = query.tab ?? 'all';

    let statusFilter: DesignRequestStatus[] | undefined;
    switch (tab) {
      case 'quote_submitted':
        statusFilter = [DesignRequestStatus.QUOTE_SUBMITTED];
        break;
      case 'negotiating':
        statusFilter = [DesignRequestStatus.NEGOTIATING];
        break;
      case 'completed':
        statusFilter = [DesignRequestStatus.COMPLETED];
        break;
      default:
        statusFilter = undefined;
    }

    const where: Prisma.DesignRequestWhereInput = {
      targets: { some: { jewelerProfileId: profile.id } },
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.designRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          design: { select: { id: true, title: true, thumbnailUploadId: true, itemType: true } },
          requester: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.designRequest.count({ where }),
    ]);

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  async listPortfolio(userId: string) {
    const profile = await this.getOwnProfile(userId);
    const items = await this.prisma.portfolioItem.findMany({
      where: { profileId: profile.id },
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((item) => ({ ...item, contentUrl: this.access.signedContentPath(item.uploadId) }));
  }

  async createPortfolioItem(userId: string, dto: CreatePortfolioItemDto) {
    const profile = await this.getOwnProfile(userId);
    await this.uploads.assertOwnedImage(dto.uploadId, userId, 'uploadId');

    return this.prisma.portfolioItem.create({
      data: {
        profileId: profile.id,
        uploadId: dto.uploadId,
        title: dto.title,
        sortOrder: dto.sortOrder ?? 0,
        isSelectedWork: dto.isSelectedWork ?? true,
      },
    });
  }

  private async getOwnPortfolioItem(userId: string, itemId: string) {
    const profile = await this.getOwnProfile(userId);
    const item = await this.prisma.portfolioItem.findFirst({ where: { id: itemId, profileId: profile.id } });
    if (!item) {
      throw new NotFoundException({ success: false, message: 'Portfolio item not found' });
    }
    return item;
  }

  async updatePortfolioItem(userId: string, itemId: string, dto: UpdatePortfolioItemDto) {
    await this.getOwnPortfolioItem(userId, itemId);
    return this.prisma.portfolioItem.update({
      where: { id: itemId },
      data: {
        title: dto.title,
        sortOrder: dto.sortOrder,
        isSelectedWork: dto.isSelectedWork,
      },
    });
  }

  async removePortfolioItem(userId: string, itemId: string): Promise<void> {
    await this.getOwnPortfolioItem(userId, itemId);
    await this.prisma.portfolioItem.delete({ where: { id: itemId } });
  }

  // ---------------------------------------------------------------------
  // CRM notes (Sprint 12) — production tracking for own profile only, gated by jeweler_crm.
  // ---------------------------------------------------------------------

  async listCrmNotes(userId: string) {
    await this.entitlements.assert(userId, CRM_ENTITLEMENT_KEY);
    const profile = await this.getOwnProfile(userId);
    return this.prisma.jewelerCrmNote.findMany({
      where: { jewelerProfileId: profile.id },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createCrmNote(userId: string, dto: CreateCrmNoteDto) {
    await this.entitlements.assert(userId, CRM_ENTITLEMENT_KEY);
    const profile = await this.getOwnProfile(userId);

    if (dto.designRequestId) {
      const request = await this.prisma.designRequest.findFirst({
        where: { id: dto.designRequestId, targets: { some: { jewelerProfileId: profile.id } } },
      });
      if (!request) {
        throw new BadRequestException({
          success: false,
          message: 'designRequestId must reference a request delivered to this jeweler profile',
        });
      }
    }

    const note = await this.prisma.jewelerCrmNote.create({
      data: {
        jewelerProfileId: profile.id,
        designRequestId: dto.designRequestId ?? null,
        body: dto.body,
        productionStatus: dto.productionStatus ?? null,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      action: 'jeweler_crm_note.create',
      entityType: 'JewelerCrmNote',
      entityId: note.id,
      after: toJsonValue(note),
    });

    return note;
  }

  async updateCrmNote(userId: string, noteId: string, dto: UpdateCrmNoteDto) {
    await this.entitlements.assert(userId, CRM_ENTITLEMENT_KEY);
    const profile = await this.getOwnProfile(userId);

    const existing = await this.prisma.jewelerCrmNote.findFirst({
      where: { id: noteId, jewelerProfileId: profile.id },
    });
    if (!existing) {
      throw new NotFoundException({ success: false, message: 'CRM note not found' });
    }

    if (dto.designRequestId) {
      const request = await this.prisma.designRequest.findFirst({
        where: { id: dto.designRequestId, targets: { some: { jewelerProfileId: profile.id } } },
      });
      if (!request) {
        throw new BadRequestException({
          success: false,
          message: 'designRequestId must reference a request delivered to this jeweler profile',
        });
      }
    }

    const note = await this.prisma.jewelerCrmNote.update({
      where: { id: noteId },
      data: {
        designRequestId: dto.designRequestId,
        body: dto.body,
        productionStatus: dto.productionStatus,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      action: 'jeweler_crm_note.update',
      entityType: 'JewelerCrmNote',
      entityId: noteId,
      before: toJsonValue(existing),
      after: toJsonValue(note),
    });

    return note;
  }

  async adminApprove(id: string, adminUserId: string): Promise<JewelerProfile> {
    const profile = await this.prisma.jewelerProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException({ success: false, message: 'Jeweler profile not found' });
    }

    this.stateMachine.assertReachable(
      this.stateMachine.profilePublishGraph,
      profile.publishStatus,
      ProfilePublishStatus.PUBLISHED,
    );

    const updated = await this.prisma.jewelerProfile.update({
      where: { id },
      data: { publishStatus: ProfilePublishStatus.PUBLISHED, publishedAt: new Date() },
    });

    await this.audit.log({
      actorUserId: adminUserId,
      action: 'jeweler_profile.admin_approve',
      entityType: 'JewelerProfile',
      entityId: id,
      before: { publishStatus: profile.publishStatus },
      after: { publishStatus: updated.publishStatus },
    });

    return updated;
  }

  async adminSetVerifiedBadge(id: string, verified: boolean, adminUserId: string): Promise<JewelerProfile> {
    const profile = await this.prisma.jewelerProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException({ success: false, message: 'Jeweler profile not found' });
    }

    const updated = await this.prisma.jewelerProfile.update({
      where: { id },
      data: { verifiedBadge: verified, verifiedAt: verified ? new Date() : null },
    });

    await this.audit.log({
      actorUserId: adminUserId,
      action: 'jeweler_profile.admin_verify_badge',
      entityType: 'JewelerProfile',
      entityId: id,
      before: { verifiedBadge: profile.verifiedBadge },
      after: { verifiedBadge: updated.verifiedBadge },
    });

    return updated;
  }
}

function asOptionalCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
