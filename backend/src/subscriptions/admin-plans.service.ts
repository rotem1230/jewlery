import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingCycle, Prisma, SubscriptionStatus, User, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { PrismaService } from '../database/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/admin-plans.dto';

const AI_RENDERS = 'ai_renders';
const LIVE = [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];

const PLAN_INCLUDE = {
  entitlements: { include: { entitlement: true } },
  _count: { select: { subscriptions: { where: { status: { in: LIVE } } } } },
} satisfies Prisma.PlanCatalogInclude;
type AdminPlan = Prisma.PlanCatalogGetPayload<{ include: typeof PLAN_INCLUDE }>;

type Tx = Prisma.TransactionClient;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * The plan catalog as the admin edits it (the pricing table's "change prices and plans from the
 * admin system"): prices, cycles, trials, quotas, the AI creations per period, the features a plan
 * unlocks and what its card says. A price change applies to new subscribers; existing ones keep
 * the price they agreed to. Every change is in the audit log.
 */
@Injectable()
export class AdminPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const plans = await this.prisma.planCatalog.findMany({ include: PLAN_INCLUDE, orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] });
    return plans.map((plan) => this.view(plan));
  }

  /** The features a plan can unlock (the AI creations are set by their own number). */
  async features() {
    const rows = await this.prisma.entitlementDefinition.findMany({ where: { key: { not: AI_RENDERS } }, orderBy: { key: 'asc' } });
    return rows.map((row) => ({ key: row.key, description: row.description }));
  }

  async create(admin: User, dto: CreatePlanDto) {
    if (await this.prisma.planCatalog.findUnique({ where: { code: dto.code } })) {
      throw new ConflictException({ success: false, message: `A plan with the code ${dto.code} exists`, code: 'PLAN_EXISTS' });
    }
    const featureIds = await this.featureIds(dto.features ?? []);
    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.planCatalog.create({
        data: {
          code: dto.code,
          role: dto.role as UserRole,
          nameHe: dto.nameHe,
          nameEn: dto.nameEn ?? null,
          billingCycle: dto.billingCycle as BillingCycle,
          price: dto.price,
          currency: 'ILS',
          trialDays: dto.trialDays ?? 0,
          leadQuota: dto.leadQuota ?? 0,
          extraLeadPrice: dto.extraLeadPrice ?? null,
          sortOrder: dto.sortOrder ?? 100,
          isActive: dto.isActive ?? true,
          inclusions: { bullets: dto.bulletsHe ?? [], bulletsEn: dto.bulletsEn ?? [] },
          metadata: dto.unlimited ? { unlimited: true } : Prisma.JsonNull,
        },
      });
      await this.setFeatures(tx, created.id, featureIds);
      if (dto.aiRenders !== undefined) await this.setAiRenders(tx, created.id, dto.aiRenders);
      return tx.planCatalog.findUniqueOrThrow({ where: { id: created.id }, include: PLAN_INCLUDE });
    });
    await this.audit.log({ actorUserId: admin.id, action: 'plan.created', entityType: 'PlanCatalog', entityId: plan.id, after: toJsonValue(plan) });
    return this.view(plan);
  }

  async update(admin: User, code: string, dto: UpdatePlanDto) {
    const before = await this.prisma.planCatalog.findUnique({ where: { code }, include: PLAN_INCLUDE });
    if (!before) throw new NotFoundException({ success: false, message: 'Plan not found' });
    const featureIds = dto.features ? await this.featureIds(dto.features) : null;
    const inclusions = record(before.inclusions);
    const metadata = record(before.metadata);

    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.planCatalog.update({
        where: { id: before.id },
        data: {
          ...(dto.nameHe !== undefined ? { nameHe: dto.nameHe } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.billingCycle !== undefined ? { billingCycle: dto.billingCycle as BillingCycle } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
          ...(dto.leadQuota !== undefined ? { leadQuota: dto.leadQuota } : {}),
          ...(dto.extraLeadPrice !== undefined ? { extraLeadPrice: dto.extraLeadPrice } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.bulletsHe !== undefined || dto.bulletsEn !== undefined
            ? {
                inclusions: {
                  bullets: dto.bulletsHe ?? strings(inclusions.bullets),
                  bulletsEn: dto.bulletsEn ?? strings(inclusions.bulletsEn),
                },
              }
            : {}),
          ...(dto.unlimited !== undefined ? { metadata: { ...metadata, unlimited: dto.unlimited } as Prisma.InputJsonValue } : {}),
        },
      });
      if (featureIds) await this.setFeatures(tx, before.id, featureIds);
      if (dto.aiRenders !== undefined) await this.setAiRenders(tx, before.id, dto.aiRenders);
      return tx.planCatalog.findUniqueOrThrow({ where: { id: before.id }, include: PLAN_INCLUDE });
    });
    await this.audit.log({
      actorUserId: admin.id,
      action: 'plan.updated',
      entityType: 'PlanCatalog',
      entityId: plan.id,
      before: toJsonValue(before),
      after: toJsonValue(plan),
    });
    return this.view(plan);
  }

  /** The ids of these feature keys; an unknown key is refused. */
  private async featureIds(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    const rows = await this.prisma.entitlementDefinition.findMany({ where: { key: { in: unique, not: AI_RENDERS } } });
    const missing = unique.filter((key) => !rows.some((row) => row.key === key));
    if (missing.length > 0) {
      throw new BadRequestException({ success: false, message: `Unknown features: ${missing.join(', ')}`, code: 'UNKNOWN_FEATURE' });
    }
    return rows.map((row) => row.id);
  }

  /** The plan unlocks exactly these features (its AI creations are kept). */
  private async setFeatures(tx: Tx, planId: string, entitlementIds: string[]): Promise<void> {
    await tx.planEntitlement.deleteMany({
      where: { planId, entitlementId: { notIn: entitlementIds }, entitlement: { key: { not: AI_RENDERS } } },
    });
    for (const entitlementId of entitlementIds) {
      await tx.planEntitlement.upsert({
        where: { planId_entitlementId: { planId, entitlementId } },
        update: {},
        create: { planId, entitlementId },
      });
    }
  }

  /** AI creations per period: a number, or null for the free plan's. */
  private async setAiRenders(tx: Tx, planId: string, limit: number | null): Promise<void> {
    const definition = await tx.entitlementDefinition.findUnique({ where: { key: AI_RENDERS } });
    if (!definition) return;
    if (limit === null) {
      await tx.planEntitlement.deleteMany({ where: { planId, entitlementId: definition.id } });
      return;
    }
    await tx.planEntitlement.upsert({
      where: { planId_entitlementId: { planId, entitlementId: definition.id } },
      update: { limitValue: limit },
      create: { planId, entitlementId: definition.id, limitValue: limit },
    });
  }

  private view(plan: AdminPlan) {
    const inclusions = record(plan.inclusions);
    const metadata = record(plan.metadata);
    const ai = plan.entitlements.find((row) => row.entitlement.key === AI_RENDERS);
    return {
      id: plan.id,
      code: plan.code,
      role: plan.role,
      nameHe: plan.nameHe,
      nameEn: plan.nameEn,
      billingCycle: plan.billingCycle,
      price: Number(plan.price),
      currency: plan.currency,
      trialDays: plan.trialDays,
      leadQuota: plan.leadQuota,
      extraLeadPrice: plan.extraLeadPrice === null ? null : Number(plan.extraLeadPrice),
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      bulletsHe: strings(inclusions.bullets),
      bulletsEn: strings(inclusions.bulletsEn),
      features: plan.entitlements
        .map((row) => row.entitlement.key)
        .filter((key) => key !== AI_RENDERS)
        .sort(),
      aiRenders: ai ? ai.limitValue : null,
      unlimited: metadata.unlimited === true,
      liveSubscribers: plan._count.subscriptions,
    };
  }
}
