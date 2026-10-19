import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JewelryPaymentStatus, JobStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const LIVE = [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];
const GB = 1024 ** 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_USERS = 500;
/** Costs of users with no live plan (free designers, jewelers who never chose a plan). */
export const NO_PLAN = 'NONE';

const money = (value: number) => Math.round(value * 100) / 100;
/** Payments are summed in agorot (exact); estimated costs are not money that moved. */
const agorot = (value: unknown) => Math.round(num(value) * 100);
const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

type Range = { from: Date; to: Date };

/**
 * The pricing table's financial control: usage and costs per user (AI creations, storage,
 * traffic) and revenue and expenses per plan, with the jewelry money owed to and transferred to
 * jewelers. Costs are estimates from the configured prices (AI_IMAGE_COST_USD, USD_TO_ILS,
 * STORAGE_COST_ILS_PER_GB_MONTH, TRAFFIC_COST_ILS_PER_GB, CARD_FEE_PERCENT); a user's costs count
 * toward the plan they hold now.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** From the start of this month (UTC) to now, unless given. */
  range(query: { from?: Date; to?: Date }): Range {
    const now = new Date();
    return {
      from: query.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: query.to ?? now,
    };
  }

  assumptions() {
    const usd = this.config.get<number>('costs.aiImageUsd') ?? 0;
    const rate = this.config.get<number>('costs.usdToIls') ?? 0;
    return {
      aiImageCostIls: Math.round(usd * rate * 10000) / 10000,
      storageIlsPerGbMonth: this.config.get<number>('costs.storageIlsPerGbMonth') ?? 0,
      trafficIlsPerGb: this.config.get<number>('costs.trafficIlsPerGb') ?? 0,
      cardFeePercent: this.config.get<number>('costs.cardFeePercent') ?? 0,
    };
  }

  /** Per user: AI creations and their cost, storage, traffic, plan revenue and fair-use alerts. */
  async usage(query: { from?: Date; to?: Date }) {
    const range = this.range(query);
    const costs = await this.costsByUser(range);
    const [revenue, refunds, alerts] = await Promise.all([this.revenueByUser(range), this.refundsByUser(range), this.alertsByUser(range)]);
    const ids = new Set([...costs.keys(), ...revenue.keys(), ...alerts.keys()]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        subscriptions: { where: { status: { in: LIVE } }, select: { plan: { select: { code: true, nameHe: true } } }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
    const rows = users.map((user) => {
      const cost = costs.get(user.id) ?? emptyCost();
      return {
        user: { id: user.id, email: user.email, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null },
        plan: user.subscriptions[0]?.plan ?? null,
        aiCreations: cost.aiCreations,
        aiCost: money(cost.aiCost),
        storageBytes: cost.storageBytes,
        storageCost: money(cost.storageCost),
        trafficBytes: cost.trafficBytes,
        trafficCost: money(cost.trafficCost),
        totalCost: money(cost.aiCost + cost.storageCost + cost.trafficCost),
        revenue: money(revenue.get(user.id) ?? 0),
        refunds: money(refunds.get(user.id) ?? 0),
        alerts: alerts.get(user.id) ?? [],
      };
    });
    rows.sort((a, b) => b.totalCost - a.totalCost || b.revenue - a.revenue);
    return { from: range.from, to: range.to, assumptions: this.assumptions(), users: rows.slice(0, MAX_USERS) };
  }

  /** Per plan: payments, revenue, refunds, card fees, AI / storage / traffic costs and net; and the jewelry money. */
  async finance(query: { from?: Date; to?: Date }) {
    const range = this.range(query);
    const feePct = this.assumptions().cardFeePercent;
    const plans = await this.prisma.planCatalog.findMany({
      orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { subscriptions: { where: { status: { in: LIVE } } } } } },
    });
    const rows = new Map(
      plans.map((plan) => [
        plan.id,
        { code: plan.code, nameHe: plan.nameHe, role: plan.role as string, activeSubscribers: plan._count.subscriptions, payments: 0, revenue: 0, refunds: 0, aiCost: 0, storageCost: 0, trafficCost: 0 },
      ]),
    );
    const none = { code: NO_PLAN, nameHe: 'ללא מסלול בתשלום', role: 'ALL', activeSubscribers: 0, payments: 0, revenue: 0, refunds: 0, aiCost: 0, storageCost: 0, trafficCost: 0 };

    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: { paidAt: { gte: range.from, lt: range.to } },
      select: { amount: true, subscription: { select: { planId: true } } },
    });
    for (const invoice of invoices) {
      const row = rows.get(invoice.subscription.planId);
      if (row) {
        row.payments += 1;
        row.revenue += agorot(invoice.amount);
      }
    }
    const refunds = await this.prisma.paymentRefund.findMany({
      where: { status: 'SUCCEEDED', completedAt: { gte: range.from, lt: range.to }, subscriptionInvoiceId: { not: null } },
      select: { amount: true, subscriptionInvoice: { select: { subscription: { select: { planId: true } } } } },
    });
    for (const refund of refunds) {
      const row = refund.subscriptionInvoice ? rows.get(refund.subscriptionInvoice.subscription.planId) : undefined;
      if (row) row.refunds += agorot(refund.amount);
    }

    // Costs count toward the plan each user holds now.
    const costs = await this.costsByUser(range);
    const holders = await this.prisma.subscription.findMany({
      where: { userId: { in: [...costs.keys()] }, status: { in: LIVE } },
      select: { userId: true, planId: true },
      orderBy: { createdAt: 'desc' },
    });
    const planOf = new Map<string, string>();
    for (const holder of holders) if (!planOf.has(holder.userId)) planOf.set(holder.userId, holder.planId);
    for (const [userId, cost] of costs) {
      const row = rows.get(planOf.get(userId) ?? '') ?? none;
      row.aiCost += cost.aiCost;
      row.storageCost += cost.storageCost;
      row.trafficCost += cost.trafficCost;
    }

    const planRows = [...rows.values(), none].map((row) => {
      const revenue = row.revenue / 100;
      const refunded = row.refunds / 100;
      const cardFees = (revenue * feePct) / 100;
      return {
        ...row,
        revenue: money(revenue),
        refunds: money(refunded),
        cardFees: money(cardFees),
        aiCost: money(row.aiCost),
        storageCost: money(row.storageCost),
        trafficCost: money(row.trafficCost),
        net: money(revenue - refunded - cardFees - row.aiCost - row.storageCost - row.trafficCost),
      };
    });

    const jewelry = await this.jewelry(range, feePct);
    const sum = (key: 'revenue' | 'refunds' | 'cardFees' | 'aiCost' | 'storageCost' | 'trafficCost' | 'net') =>
      money(planRows.reduce((total, row) => total + row[key], 0));
    return {
      from: range.from,
      to: range.to,
      assumptions: this.assumptions(),
      plans: planRows,
      jewelry,
      totals: {
        revenue: sum('revenue'),
        refunds: sum('refunds'),
        cardFees: sum('cardFees'),
        aiCost: sum('aiCost'),
        storageCost: sum('storageCost'),
        trafficCost: sum('trafficCost'),
        net: sum('net'),
        jewelryCommission: jewelry.commission,
      },
    };
  }

  /** Jewelry payments: taken, refunded, the platform's commission, owed and transferred to jewelers. */
  private async jewelry(range: Range, feePct: number) {
    const [payments, refunds, created, owed, transferred, recover] = await Promise.all([
      this.prisma.jewelryPaymentIntent.aggregate({
        where: { provider: 'cardcom', status: { in: [JewelryPaymentStatus.SUCCEEDED, JewelryPaymentStatus.REFUNDED] }, paidAt: { gte: range.from, lt: range.to } },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.paymentRefund.aggregate({
        where: { status: 'SUCCEEDED', completedAt: { gte: range.from, lt: range.to }, jewelryPaymentIntentId: { not: null } },
        _sum: { amount: true },
      }),
      this.prisma.jewelerPayout.aggregate({ where: { createdAt: { gte: range.from, lt: range.to }, status: { not: 'CANCELLED' } }, _sum: { commissionAmount: true } }),
      this.prisma.jewelerPayout.aggregate({ where: { status: 'OWED' }, _sum: { netAmount: true, refundedAmount: true } }),
      this.prisma.jewelerPayout.aggregate({ where: { status: 'PAID', paidAt: { gte: range.from, lt: range.to } }, _sum: { netAmount: true } }),
      this.prisma.jewelerPayout.aggregate({ where: { status: 'PAID' }, _sum: { refundedAmount: true } }),
    ]);
    const gross = num(payments._sum.amount);
    return {
      payments: payments._count,
      gross: money(gross),
      refunds: money(num(refunds._sum.amount)),
      cardFees: money((gross * feePct) / 100),
      commission: money(num(created._sum.commissionAmount)),
      owedToJewelers: money(num(owed._sum.netAmount) - num(owed._sum.refundedAmount)),
      transferredToJewelers: money(num(transferred._sum.netAmount)),
      toRecoverFromJewelers: money(num(recover._sum.refundedAmount)),
    };
  }

  /** AI, storage and traffic per user for the range (storage at today's size, for the range's days). */
  private async costsByUser(range: Range) {
    const { aiImageCostIls, storageIlsPerGbMonth, trafficIlsPerGb } = this.assumptions();
    const months = Math.max(0, range.to.getTime() - range.from.getTime()) / (30 * DAY_MS);
    const [ai, traffic, storage] = await Promise.all([
      this.prisma.aiGenerationJob.groupBy({
        by: ['requestedById'],
        where: { status: JobStatus.SUCCEEDED, createdAt: { gte: range.from, lt: range.to } },
        _count: true,
        _sum: { costIls: true },
      }),
      this.prisma.mediaTrafficDaily.groupBy({
        by: ['ownerUserId'],
        where: { day: { gte: new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate())), lte: range.to } },
        _sum: { bytes: true },
      }),
      this.prisma.upload.groupBy({ by: ['ownerUserId'], where: { deletedAt: null }, _sum: { sizeBytes: true } }),
    ]);
    const result = new Map<string, ReturnType<typeof emptyCost>>();
    const of = (userId: string) => {
      const row = result.get(userId) ?? emptyCost();
      result.set(userId, row);
      return row;
    };
    for (const row of ai) {
      const cost = of(row.requestedById);
      cost.aiCreations = row._count;
      // Jobs from before costs were recorded count at today's price.
      cost.aiCost = row._sum.costIls !== null ? num(row._sum.costIls) : row._count * aiImageCostIls;
    }
    for (const row of traffic) {
      const cost = of(row.ownerUserId);
      cost.trafficBytes = num(row._sum.bytes);
      cost.trafficCost = (cost.trafficBytes / GB) * trafficIlsPerGb;
    }
    for (const row of storage) {
      const bytes = num(row._sum.sizeBytes);
      if (bytes <= 0) continue;
      const cost = of(row.ownerUserId);
      cost.storageBytes = bytes;
      cost.storageCost = (bytes / GB) * storageIlsPerGbMonth * months;
    }
    return result;
  }

  private async revenueByUser(range: Range) {
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: { paidAt: { gte: range.from, lt: range.to } },
      select: { amount: true, subscription: { select: { userId: true } } },
    });
    const result = new Map<string, number>();
    for (const invoice of invoices) {
      result.set(invoice.subscription.userId, (result.get(invoice.subscription.userId) ?? 0) + agorot(invoice.amount));
    }
    return new Map([...result].map(([userId, total]) => [userId, total / 100]));
  }

  private async refundsByUser(range: Range) {
    const refunds = await this.prisma.paymentRefund.findMany({
      where: { status: 'SUCCEEDED', completedAt: { gte: range.from, lt: range.to }, subscriptionInvoiceId: { not: null } },
      select: { amount: true, subscriptionInvoice: { select: { subscription: { select: { userId: true } } } } },
    });
    const result = new Map<string, number>();
    for (const refund of refunds) {
      const userId = refund.subscriptionInvoice?.subscription.userId;
      if (userId) result.set(userId, (result.get(userId) ?? 0) + agorot(refund.amount));
    }
    return new Map([...result].map(([userId, total]) => [userId, total / 100]));
  }

  private async alertsByUser(range: Range) {
    const alerts = await this.prisma.usageAlert.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { userId: true, kind: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const result = new Map<string, Array<{ kind: string; at: Date }>>();
    for (const alert of alerts) {
      const list = result.get(alert.userId) ?? [];
      list.push({ kind: alert.kind, at: alert.createdAt });
      result.set(alert.userId, list);
    }
    return result;
  }
}

function emptyCost() {
  return { aiCreations: 0, aiCost: 0, storageBytes: 0, storageCost: 0, trafficBytes: 0, trafficCost: 0 };
}
