import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Design,
  DesignRequestStatus,
  DesignStatus,
  FeasibilityStatus,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { AppConfigService } from '../cms/app-config.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { PrismaService } from '../database/prisma.service';
import { stableJson } from './design-fingerprint';
import { DesignPreviewService } from './design-preview.service';
import { UploadAccessService } from '../uploads/upload-access.service';
import { UploadsService } from '../uploads/uploads.service';
import { WizardEngineService } from '../wizard/wizard-engine.service';
import { AdminUnlockDesignDto, CreateDesignDto, LockDesignDto, QueryDesignsDto, UnlockDesignDto, UpdateDesignDto } from './dto/design.dto';

const COMPLETED_BY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  jewelerProfile: { select: { businessName: true } },
} satisfies Prisma.UserSelect;

const PAGE_SIZE = 20;
const DEFAULT_PUBLISH_TTL_DAYS = 30;

/** Request states in which a jeweler is (or was) making the piece: the design stays. */
const DESIGN_IN_WORK_REQUEST_STATUSES: DesignRequestStatus[] = [
  DesignRequestStatus.OPEN,
  DesignRequestStatus.QUOTE_SUBMITTED,
  DesignRequestStatus.NEGOTIATING,
  DesignRequestStatus.COMPLETED,
];

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly appConfig: AppConfigService,
    private readonly wizard: WizardEngineService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly uploads: UploadsService,
    private readonly access: UploadAccessService,
    private readonly previews: DesignPreviewService,
  ) {}

  private assertOwnerOrAdmin(design: { ownerUserId: string }, user: User): void {
    if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the design owner' });
    }
  }

  private async getOwned(id: string, user: User): Promise<Design> {
    const design = await this.prisma.design.findFirst({ where: { id, deletedAt: null } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    this.assertOwnerOrAdmin(design, user);
    return design;
  }

  private getByPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /** Who made a completed design: the jeweler's business, else their name (PRD 5.3). */
  private completedBy(
    user: { id: string; firstName: string | null; lastName: string | null; jewelerProfile: { businessName: string } | null } | null,
  ) {
    if (!user) {
      return null;
    }
    return { id: user.id, name: user.jewelerProfile?.businessName || this.fullName(user) };
  }

  private fullName(user: { firstName: string | null; lastName: string | null } | null): string | null {
    if (!user) {
      return null;
    }
    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return name.length > 0 ? name : null;
  }

  private resolveSort(sort?: string): Prisma.DesignOrderByWithRelationInput {
    switch (sort) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'updated':
        return { updatedAt: 'desc' };
      case 'title':
        return { title: 'asc' };
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }

  private async nextVersionNumber(designId: string): Promise<number> {
    const last = await this.prisma.designVersion.findFirst({
      where: { designId },
      orderBy: { versionNumber: 'desc' },
    });
    return (last?.versionNumber ?? 0) + 1;
  }

  /** Snapshots the design; retries when a concurrent snapshot took the same version number. */
  private async snapshotVersion(design: Design, actorUserId: string, reason: string) {
    for (let attempt = 0; ; attempt += 1) {
      const versionNumber = await this.nextVersionNumber(design.id);
      try {
        return await this.prisma.designVersion.create({
          data: {
            designId: design.id,
            versionNumber,
            status: design.status,
            parameters: design.parameters as Prisma.InputJsonValue,
            jewelerNotes: design.jewelerNotes,
            createdById: actorUserId,
            reason,
          },
        });
      } catch (err) {
        const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!duplicate || attempt >= 4) {
          throw err;
        }
      }
    }
  }

  private assertLockedFieldsUnchanged(design: Design, nextParameters: unknown): void {
    for (const field of design.lockedFields) {
      const oldValue = this.getByPath(design.parameters, field);
      const newValue = this.getByPath(nextParameters, field);
      if (stableJson(oldValue) !== stableJson(newValue)) {
        throw new ForbiddenException({
          success: false,
          message: `Field "${field}" is locked and cannot be edited`,
          code: 'FIELD_LOCKED',
        });
      }
    }
  }

  private async tabCounts(ownerUserId: string) {
    const base: Prisma.DesignWhereInput = { ownerUserId, deletedAt: null };
    const [all, drafts, published, completed, archive] = await Promise.all([
      this.prisma.design.count({ where: base }),
      this.prisma.design.count({ where: { ...base, status: DesignStatus.DRAFT } }),
      this.prisma.design.count({ where: { ...base, status: DesignStatus.PUBLISHED } }),
      this.prisma.design.count({ where: { ...base, status: DesignStatus.COMPLETED } }),
      this.prisma.design.count({ where: { ...base, status: DesignStatus.ARCHIVED } }),
    ]);
    return { all, drafts, published, completed, archive };
  }

  async create(ownerUserId: string, dto: CreateDesignDto): Promise<Design> {
    const itemType = await this.prisma.itemType.findUnique({ where: { id: dto.itemTypeId } });
    if (!itemType) {
      throw new NotFoundException({ success: false, message: 'Unknown item type' });
    }
    if (dto.preferredRegionId) {
      const region = await this.prisma.region.findUnique({ where: { id: dto.preferredRegionId } });
      if (!region) {
        throw new NotFoundException({ success: false, message: 'Unknown region' });
      }
    }

    if (dto.parameters !== undefined) {
      await this.assertValidParameters(dto.itemTypeId, dto.parameters);
    }

    const design = await this.prisma.design.create({
      data: {
        ownerUserId,
        itemTypeId: dto.itemTypeId,
        preferredRegionId: dto.preferredRegionId ?? null,
        title: dto.title ?? null,
        parameters: (dto.parameters ?? {}) as Prisma.InputJsonValue,
        status: DesignStatus.DRAFT,
      },
    });

    await this.snapshotVersion(design, ownerUserId, 'create');
    this.previews.schedule(design.id);
    await this.audit.log({
      actorUserId: ownerUserId,
      action: 'design.create',
      entityType: 'Design',
      entityId: design.id,
      after: toJsonValue(design),
    });

    return design;
  }

  async findMany(ownerUserId: string, query: QueryDesignsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const where: Prisma.DesignWhereInput = { ownerUserId, deletedAt: null };
    if (query.status) {
      where.status = query.status;
    }
    if (query.itemTypeId) {
      where.itemTypeId = query.itemTypeId;
    }

    const [rows, total, counts] = await Promise.all([
      this.prisma.design.findMany({
        where,
        orderBy: this.resolveSort(query.sort),
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          itemType: true,
          preferredRegion: true,
          completedBy: { select: COMPLETED_BY_SELECT },
          _count: { select: { quotes: true } },
        },
      }),
      this.prisma.design.count({ where }),
      this.tabCounts(ownerUserId),
    ]);

    const items = rows.map(({ _count, completedBy, ...design }) => ({
      ...design,
      thumbnailUrl: this.access.urlFor(design.thumbnailUploadId),
      previewUrl: this.access.urlFor(design.previewUploadId),
      quoteCount: _count.quotes,
      completedBy: this.completedBy(completedBy),
    }));

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
      tabCounts: counts,
    };
  }

  /** Signed link to the design's inspiration picture, minted only for an upload its owner owns. */
  private async inspirationUrl(design: Pick<Design, 'ownerUserId' | 'parameters'>): Promise<string | null> {
    const id = (design.parameters as { inspirationUploadId?: unknown } | null)?.inspirationUploadId;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return null;
    }
    const upload = await this.prisma.upload.findFirst({
      where: { id, ownerUserId: design.ownerUserId, deletedAt: null },
      select: { id: true },
    });
    return upload ? this.access.signedContentPath(upload.id) : null;
  }

  async findOne(id: string, user: User) {
    const design = await this.prisma.design.findFirst({
      where: { id, deletedAt: null },
      include: {
        itemType: true,
        preferredRegion: true,
        completedBy: { select: COMPLETED_BY_SELECT },
        _count: { select: { quotes: true } },
      },
    });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    this.assertOwnerOrAdmin(design, user);

    const versions = await this.prisma.designVersion.findMany({
      where: { designId: id },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        reason: true,
        createdById: true,
        createdAt: true,
      },
    });

    // A design saved while the server was down (or before previews existed) gets its picture now.
    if (!design.previewUploadId || design.previewVersion !== design.version) this.previews.schedule(design.id);
    const { _count, completedBy, ...rest } = design;
    return {
      ...rest,
      thumbnailUrl: this.access.urlFor(rest.thumbnailUploadId),
      previewUrl: this.access.urlFor(rest.previewUploadId),
      inspirationUrl: await this.inspirationUrl(design),
      quoteCount: _count.quotes,
      completedBy: this.completedBy(completedBy),
      versions,
    };
  }

  /** An accepted quote is a deal on these exact parameters: the design is frozen from then on. */
  private assertNotCompleted(design: Design): void {
    if (design.acceptedQuoteId || design.status === DesignStatus.COMPLETED) {
      throw new ConflictException({
        success: false,
        message: 'This design has an accepted quote and can no longer be changed; duplicate it instead',
        code: 'DESIGN_COMPLETED',
      });
    }
  }

  async update(id: string, user: User, dto: UpdateDesignDto): Promise<Design> {
    const design = await this.getOwned(id, user);
    this.assertNotCompleted(design);

    if (design.version !== dto.version) {
      throw new ConflictException({
        success: false,
        message: 'Design was modified since it was last loaded; refresh and retry',
        code: 'STALE_VERSION',
        currentVersion: design.version,
      });
    }

    if (dto.parameters !== undefined) {
      this.assertLockedFieldsUnchanged(design, dto.parameters);
    }
    if (dto.thumbnailUploadId) {
      await this.uploads.assertOwnedImage(dto.thumbnailUploadId, design.ownerUserId, 'thumbnailUploadId');
    }
    if (dto.preferredRegionId) {
      const region = await this.prisma.region.findUnique({ where: { id: dto.preferredRegionId } });
      if (!region) {
        throw new NotFoundException({ success: false, message: 'Unknown region' });
      }
    }

    if (dto.parameters !== undefined) {
      await this.assertValidParameters(design.itemTypeId, dto.parameters, design.parameters);
    }

    // Conditional on the version the client edited, so two concurrent saves cannot both win.
    const claimed = await this.prisma.design.updateMany({
      where: { id, version: dto.version, deletedAt: null },
      data: {
        title: dto.title,
        description: dto.description,
        jewelerNotes: dto.jewelerNotes,
        preferredRegionId: dto.preferredRegionId,
        thumbnailUploadId: dto.thumbnailUploadId,
        parameters: dto.parameters !== undefined ? (dto.parameters as Prisma.InputJsonValue) : undefined,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.design.findUnique({ where: { id }, select: { version: true } });
      throw new ConflictException({
        success: false,
        message: 'Design was modified since it was last loaded; refresh and retry',
        code: 'STALE_VERSION',
        currentVersion: current?.version,
      });
    }
    const updated = await this.prisma.design.findUniqueOrThrow({ where: { id } });

    if (dto.parameters !== undefined) {
      await this.snapshotVersion(updated, user.id, 'autosave');
      this.previews.schedule(id);
    }

    await this.audit.log({
      actorUserId: user.id,
      action: 'design.update',
      entityType: 'Design',
      entityId: id,
      before: toJsonValue(design),
      after: toJsonValue(updated),
    });

    return updated;
  }

  /**
   * `previous`: the design's saved parameters — a rule that came after a choice was saved (a stone's
   * own colours, a metal no longer offered) holds only for what is chosen now.
   */
  private async assertValidParameters(itemTypeId: string, parameters: unknown, previous?: unknown): Promise<void> {
    const validation = await this.wizard.validateParameters(itemTypeId, parameters, previous);
    if (!validation.valid) {
      throw new BadRequestException({
        success: false,
        message: 'Design parameters failed validation',
        errors: validation.errors,
      });
    }
  }

  async duplicate(id: string, user: User): Promise<Design> {
    const design = await this.getOwned(id, user);

    const copy = await this.prisma.design.create({
      data: {
        ownerUserId: user.id,
        itemTypeId: design.itemTypeId,
        preferredRegionId: design.preferredRegionId,
        title: design.title ? `${design.title} (Copy)` : null,
        description: design.description,
        parameters: design.parameters as Prisma.InputJsonValue,
        status: DesignStatus.DRAFT,
      },
    });

    await this.snapshotVersion(copy, user.id, 'duplicate');
    this.previews.schedule(copy.id);
    await this.audit.log({
      actorUserId: user.id,
      action: 'design.duplicate',
      entityType: 'Design',
      entityId: copy.id,
      before: { sourceDesignId: id },
      after: toJsonValue(copy),
    });

    return copy;
  }

  /**
   * The owner deletes a design they no longer want (client notes of 25.11: a design started by
   * mistake, or on the wrong piece). Soft delete: every read already skips deletedAt rows.
   * Refused while a jeweler works on it: an accepted quote, any quote, or a request that is
   * open, quoted, negotiating or completed.
   */
  async remove(id: string, user: User): Promise<{ id: string; deleted: true }> {
    await this.getOwned(id, user);

    const removed = await this.prisma.$transaction(async (tx) => {
      // Under the row lock: a request or quote arriving meanwhile waits, then sees it deleted.
      await tx.$queryRaw`SELECT id FROM 'designs' WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.design.findFirst({ where: { id, deletedAt: null } });
      if (!current) {
        throw new NotFoundException({ success: false, message: 'Design not found' });
      }
      const [liveRequests, quotes] = await Promise.all([
        tx.designRequest.count({ where: { designId: id, status: { in: DESIGN_IN_WORK_REQUEST_STATUSES } } }),
        tx.quote.count({ where: { designId: id } }),
      ]);
      if (current.acceptedQuoteId || liveRequests > 0 || quotes > 0) {
        throw new ConflictException({
          success: false,
          message: 'A jeweler is working on this design, so it cannot be deleted',
          code: 'DESIGN_IN_WORK',
        });
      }
      return tx.design.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'design.delete',
      entityType: 'Design',
      entityId: id,
      before: { status: removed.status, title: removed.title },
      after: { deletedAt: removed.deletedAt },
    });

    return { id, deleted: true };
  }

  async transition(id: string, user: User, toStatus: DesignStatus): Promise<Design> {
    const design = await this.getOwned(id, user);
    // COMPLETED records who made the piece; only accepting a quote can set it.
    if (toStatus === DesignStatus.COMPLETED) {
      throw new ConflictException({
        success: false,
        message: 'A design is completed by accepting a quote',
        code: 'COMPLETE_BY_ACCEPTING_A_QUOTE',
      });
    }
    // An accepted quote is final: the design can be archived, never offered again (duplicate it instead).
    if (design.acceptedQuoteId && (toStatus === DesignStatus.PUBLISHED || toStatus === DesignStatus.DRAFT)) {
      throw new ConflictException({
        success: false,
        message: 'This design already has an accepted quote; duplicate it to start a new one',
        code: 'DESIGN_COMPLETED',
      });
    }
    this.stateMachine.assertTransition(this.stateMachine.designGraph, design.status, toStatus);

    const data: Prisma.DesignUpdateInput = { status: toStatus, version: { increment: 1 } };

    if (toStatus === DesignStatus.PUBLISHED) {
      // Jewelers quote what is published: it must be a complete, valid specification. Its metal
      // must be one still made (no 12K, no platinum: the client's notes of 23.11); a stone colour
      // or a size saved before the newer rules is kept.
      const { metal: _metal, ...savedBeforeRules } = (design.parameters ?? {}) as Record<string, unknown>;
      await this.assertValidParameters(design.itemTypeId, design.parameters, savedBeforeRules);
      const requireFeasibility = await this.appConfig.get('require_feasibility_before_publish');
      const feasibilityOk =
        design.feasibilityStatus === FeasibilityStatus.APPROVED ||
        design.feasibilityStatus === FeasibilityStatus.NOT_REQUIRED;
      if (requireFeasibility === true && !feasibilityOk) {
        throw new BadRequestException({
          success: false,
          message: 'Design requires an approved feasibility review before publishing',
          code: 'FEASIBILITY_REQUIRED',
        });
      }

      const ttlRaw = await this.appConfig.get('marketplace_publish_ttl_days');
      const ttlDays = typeof ttlRaw === 'number' ? ttlRaw : DEFAULT_PUBLISH_TTL_DAYS;
      const now = new Date();
      data.publishedAt = now;
      data.expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    }

    if (design.status === DesignStatus.ARCHIVED && toStatus === DesignStatus.DRAFT) {
      data.publishedAt = null;
      data.expiresAt = null;
    }

    const updated = await this.prisma.design.update({ where: { id }, data });
    await this.snapshotVersion(updated, user.id, `transition:${toStatus.toLowerCase()}`);

    if (toStatus === DesignStatus.PUBLISHED) {
      await this.outbox.enqueue('design.published', {
        designId: updated.id,
        ownerUserId: updated.ownerUserId,
      });
    }

    await this.audit.log({
      actorUserId: user.id,
      action: 'design.transition',
      entityType: 'Design',
      entityId: id,
      before: { status: design.status },
      after: { status: toStatus },
    });

    return updated;
  }

  async lock(id: string, user: User, dto: LockDesignDto): Promise<Design> {
    await this.getOwned(id, user);

    // Read-merge-write under the row lock: two simultaneous locks must both stick.
    const { previousFields, updated } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "designs" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.design.findUniqueOrThrow({ where: { id } });
      const mergedFields = Array.from(new Set([...current.lockedFields, ...dto.fields]));
      const saved = await tx.design.update({
        where: { id },
        data: { lockedAt: new Date(), lockedFields: mergedFields, version: { increment: 1 } },
      });
      return { previousFields: current.lockedFields, updated: saved };
    });

    await this.snapshotVersion(updated, user.id, 'lock');
    await this.audit.log({
      actorUserId: user.id,
      action: 'design.lock',
      entityType: 'Design',
      entityId: id,
      before: { lockedFields: previousFields },
      after: { lockedFields: updated.lockedFields },
    });

    return updated;
  }

  /**
   * The designer opens fields of their own design that were locked — the size an older studio
   * offered to lock, so a draft can be reused in another size or band width (the client's notes of
   * 23.11.2026 replace PRD 5.3's "final for the designer"). A design with an accepted quote stays
   * as agreed (409). Recorded in the audit log like support's unlock.
   */
  async unlock(id: string, user: User, dto: UnlockDesignDto): Promise<Design> {
    this.assertNotCompleted(await this.getOwned(id, user));

    const { previousFields, updated } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "designs" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.design.findUniqueOrThrow({ where: { id } });
      // Under the row lock: a quote accepted meanwhile freezes the design.
      this.assertNotCompleted(current);
      const remaining = current.lockedFields.filter((field) => !dto.fields.includes(field));
      if (remaining.length === current.lockedFields.length) {
        return { previousFields: current.lockedFields, updated: current };
      }
      const saved = await tx.design.update({
        where: { id },
        data: { lockedFields: remaining, lockedAt: remaining.length > 0 ? current.lockedAt : null, version: { increment: 1 } },
      });
      return { previousFields: current.lockedFields, updated: saved };
    });
    if (updated.lockedFields.length === previousFields.length) {
      return updated;
    }

    await this.snapshotVersion(updated, user.id, 'unlock');
    await this.audit.log({
      actorUserId: user.id,
      action: 'design.unlock',
      entityType: 'Design',
      entityId: id,
      before: { lockedFields: previousFields },
      // Who opened it: the owner, or an admin through the owner's route (with no reason given).
      after: { lockedFields: updated.lockedFields, reason: updated.ownerUserId === user.id ? 'owner' : 'admin' },
    });

    return updated;
  }

  /** Support unlocks locked fields (PRD 5.3: a lock is final for the designer, not for support). */
  async adminUnlock(id: string, adminUserId: string, dto: AdminUnlockDesignDto): Promise<Design> {
    const { previousFields, updated } = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "designs" WHERE id = ${id}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
      if (!row) {
        throw new NotFoundException({ success: false, message: 'Design not found' });
      }
      const current = await tx.design.findUniqueOrThrow({ where: { id } });
      const remaining = current.lockedFields.filter((field) => !dto.fields.includes(field));
      const saved = await tx.design.update({
        where: { id },
        data: { lockedFields: remaining, lockedAt: remaining.length > 0 ? current.lockedAt : null, version: { increment: 1 } },
      });
      return { previousFields: current.lockedFields, updated: saved };
    });

    await this.snapshotVersion(updated, adminUserId, 'unlock');
    await this.audit.log({
      actorUserId: adminUserId,
      action: 'design.unlock',
      entityType: 'Design',
      entityId: id,
      before: { lockedFields: previousFields },
      after: { lockedFields: updated.lockedFields, reason: dto.reason },
    });

    return updated;
  }

  async versions(id: string, user: User) {
    await this.getOwned(id, user);
    return this.prisma.designVersion.findMany({
      where: { designId: id },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async restoreVersion(id: string, versionNumber: number, user: User): Promise<Design> {
    const design = await this.getOwned(id, user);
    this.assertNotCompleted(design);
    const version = await this.prisma.designVersion.findUnique({
      where: { designId_versionNumber: { designId: id, versionNumber } },
    });
    if (!version) {
      throw new NotFoundException({ success: false, message: `Version ${versionNumber} not found` });
    }

    // Restoring is an edit: locked fields (e.g. size / metal agreed with a jeweler) stay locked.
    this.assertLockedFieldsUnchanged(design, version.parameters);

    const claimed = await this.prisma.design.updateMany({
      where: { id, version: design.version, deletedAt: null },
      data: {
        parameters: version.parameters as Prisma.InputJsonValue,
        jewelerNotes: version.jewelerNotes,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        success: false,
        message: 'Design was modified meanwhile; refresh and retry',
        code: 'STALE_VERSION',
      });
    }
    const updated = await this.prisma.design.findUniqueOrThrow({ where: { id } });

    await this.snapshotVersion(updated, user.id, `restore:${versionNumber}`);
    this.previews.schedule(id);
    await this.audit.log({
      actorUserId: user.id,
      action: 'design.restore_version',
      entityType: 'Design',
      entityId: id,
      after: { restoredFromVersion: versionNumber },
    });

    return updated;
  }

  async requestFeasibility(id: string, user: User): Promise<Design> {
    const design = await this.getOwned(id, user);
    const updated = await this.prisma.design.update({
      where: { id },
      data: {
        feasibilityStatus: FeasibilityStatus.PENDING,
        feasibilityReviewedAt: null,
        feasibilityReviewerId: null,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'design.feasibility_request',
      entityType: 'Design',
      entityId: id,
      before: { feasibilityStatus: design.feasibilityStatus },
      after: { feasibilityStatus: FeasibilityStatus.PENDING },
    });

    return updated;
  }

  async adminReviewFeasibility(
    id: string,
    adminUserId: string,
    status: FeasibilityStatus,
    note?: string,
  ): Promise<Design> {
    const design = await this.prisma.design.findFirst({ where: { id, deletedAt: null } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }

    const updated = await this.prisma.design.update({
      where: { id },
      data: {
        feasibilityStatus: status,
        feasibilityReviewedAt: new Date(),
        feasibilityReviewerId: adminUserId,
      },
    });

    await this.audit.log({
      actorUserId: adminUserId,
      action: 'design.feasibility_review',
      entityType: 'Design',
      entityId: id,
      before: { feasibilityStatus: design.feasibilityStatus },
      after: { feasibilityStatus: status, note: note ?? null },
    });

    return updated;
  }
}
