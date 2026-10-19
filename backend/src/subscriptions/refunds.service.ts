import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JewelryPaymentStatus, PaymentRefund, Prisma, SubscriptionStatus, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { OutboxService } from '../common/outbox/outbox.service';
import { CardcomClient, CardcomRefund, CardcomUnavailableError } from '../common/payments/cardcom.client';
import { PrismaService } from '../database/prisma.service';
import { lockUser } from '../database/row-locks';

/** Refund rows that hold money back from another refund: done, in flight, or of unknown outcome. */
export const HOLDING = ['PENDING', 'SUCCEEDED', 'UNKNOWN'];
const MAX_LISTED = 200;

type Tx = Prisma.TransactionClient;

/** What is refunded: a plan's card payment (invoice) or a jewelry payment. */
type Target = { kind: 'invoice'; id: string } | { kind: 'jewelry'; id: string };

export type RefundInput = { amount?: number; reason: string; endSubscription?: boolean; requestId?: string };

export type RefundView = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reason: string;
  failureReason: string | null;
  providerRefundId: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export function refundView(refund: PaymentRefund): RefundView {
  return {
    id: refund.id,
    status: refund.status,
    amount: Number(refund.amount),
    currency: refund.currency,
    reason: refund.reason,
    failureReason: refund.failureReason,
    providerRefundId: refund.providerRefundId,
    createdAt: refund.createdAt,
    completedAt: refund.completedAt,
  };
}

/** Cents, so the amounts compare exactly. */
export const cents = (value: Prisma.Decimal | number) => Math.round(Number(value) * 100);

/** Sum, in cents, of the refunds in these statuses. */
export function refundedCents(refunds: Array<{ status: string; amount: Prisma.Decimal }>, statuses: string[]): number {
  return refunds.filter((refund) => statuses.includes(refund.status)).reduce((total, refund) => total + cents(refund.amount), 0);
}

export function refundsNotConfigured(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    success: false,
    message: 'Refunds need the Cardcom API password (CARDCOM_API_PASSWORD)',
    code: 'REFUNDS_NOT_CONFIGURED',
  });
}

const notRefundable = (message: string) => new BadRequestException({ success: false, message, code: 'NOT_REFUNDABLE' });

/**
 * Refunds of card payments by an admin, through Cardcom: plan payments and jewelry payments. The
 * amount is reserved first (a PENDING row, under the payment's row lock, so two refunds never take
 * the same money; the admin screen's request id makes a double tap one refund), then Cardcom is
 * asked. An answer that never arrived leaves the refund UNKNOWN — still holding its amount — until
 * an admin checks it in Cardcom's panel and settles it. A refunded jewelry payment comes off what
 * the jeweler is owed.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cardcom: CardcomClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Card payments of plans, newest first, with what was refunded and what is left. */
  async listInvoices(query: { userId?: string; from?: Date; to?: Date }) {
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: {
        ...(query.userId ? { subscription: { userId: query.userId } } : {}),
        ...(query.from || query.to ? { paidAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } } : {}),
      },
      include: {
        refunds: { orderBy: { createdAt: 'asc' } },
        subscription: {
          include: {
            plan: { select: { code: true, nameHe: true } },
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: MAX_LISTED,
    });
    return invoices.map((invoice) => {
      const { user, plan } = invoice.subscription;
      return {
        id: invoice.id,
        paidAt: invoice.paidAt,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        provider: invoice.provider,
        transactionId: invoice.providerInvoiceId,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        user: { id: user.id, email: user.email, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null },
        plan,
        refunded: refundedCents(invoice.refunds, ['SUCCEEDED']) / 100,
        refundable: Math.max(0, cents(invoice.amount) - refundedCents(invoice.refunds, HOLDING)) / 100,
        refunds: invoice.refunds.map(refundView),
      };
    });
  }

  /** Payments kept for review: money that could not be applied safely, for an admin to settle. */
  async reviewItems() {
    const events = await this.prisma.paymentEvent.findMany({
      where: { outcome: 'NEEDS_REVIEW' },
      orderBy: { processedAt: 'desc' },
      take: MAX_LISTED,
    });
    return events.map((event) => ({
      id: event.id,
      provider: event.provider,
      type: event.type,
      outcome: event.outcome,
      note: event.note,
      amount: event.amount === null ? null : Number(event.amount),
      currency: event.currency,
      checkoutId: event.checkoutId,
      transactionId: event.invoiceId,
      subscriptionId: event.subscriptionId,
      jewelryPaymentId: event.jewelryPaymentIntentId,
      processedAt: event.processedAt,
    }));
  }

  refundInvoice(admin: User, invoiceId: string, input: RefundInput): Promise<RefundView> {
    return this.refund(admin, { kind: 'invoice', id: invoiceId }, input);
  }

  refundJewelry(admin: User, intentId: string, input: RefundInput): Promise<RefundView> {
    return this.refund(admin, { kind: 'jewelry', id: intentId }, input);
  }

  /** An UNKNOWN refund, settled by an admin after checking it in Cardcom's panel. */
  async resolve(admin: User, refundId: string, outcome: 'SUCCEEDED' | 'FAILED'): Promise<RefundView> {
    const updated = await this.prisma.paymentRefund.updateMany({
      where: { id: refundId, status: 'UNKNOWN' },
      data: { status: outcome, completedAt: new Date() },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.paymentRefund.count({ where: { id: refundId } });
      if (!exists) throw new NotFoundException({ success: false, message: 'Refund not found' });
      throw new ConflictException({ success: false, message: 'Only a refund of unknown outcome is settled by hand', code: 'REFUND_NOT_UNKNOWN' });
    }
    const refund = await this.prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    if (outcome === 'SUCCEEDED' && refund.jewelryPaymentIntentId) {
      await this.applyJewelryRefund(refund.jewelryPaymentIntentId);
    }
    await this.audit.log({
      actorUserId: admin.id,
      action: 'payment.refund_resolved',
      entityType: 'PaymentRefund',
      entityId: refund.id,
      after: toJsonValue(refund),
    });
    return refundView(refund);
  }

  private async refund(admin: User, target: Target, input: RefundInput): Promise<RefundView> {
    if (!this.cardcom.canRefund()) throw refundsNotConfigured();
    const repeated = await this.repeatedRequest(target, input.requestId);
    if (repeated) return repeated;

    let reserved;
    try {
      reserved = await this.reserve(admin, target, input);
    } catch (err) {
      // The same request at the same moment: the other one holds the refund.
      const again = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' ? await this.repeatedRequest(target, input.requestId) : null;
      if (again) return again;
      throw err;
    }
    const { refund, partial, subscription } = reserved;

    const settled = await this.ask(refund, partial);
    if (settled.status === 'SUCCEEDED') {
      if (target.kind === 'jewelry') {
        await this.applyJewelryRefund(target.id);
      } else if (input.endSubscription && subscription) {
        await this.endSubscription(subscription.userId, subscription.id, refund.id);
      }
    }
    await this.audit.log({
      actorUserId: admin.id,
      action: 'payment.refund',
      entityType: 'PaymentRefund',
      entityId: refund.id,
      after: toJsonValue(settled),
    });
    return refundView(settled);
  }

  /** The refund already made for this request id (a double tap), if any. */
  private async repeatedRequest(target: Target, requestId: string | undefined): Promise<RefundView | null> {
    if (!requestId) return null;
    const existing = await this.prisma.paymentRefund.findUnique({ where: { requestId } });
    if (!existing) return null;
    const same = target.kind === 'invoice' ? existing.subscriptionInvoiceId === target.id : existing.jewelryPaymentIntentId === target.id;
    if (!same) {
      throw new ConflictException({ success: false, message: 'This refund request was made for another payment', code: 'REFUND_REQUEST_REUSED' });
    }
    return refundView(existing);
  }

  /** The refunded payment, under its row lock: what was paid, by which card transaction. */
  private async payment(tx: Tx, target: Target) {
    if (target.kind === 'invoice') {
      await tx.$queryRaw`SELECT id FROM "subscription_invoices" WHERE id = ${target.id}::uuid FOR UPDATE`;
      const invoice = await tx.subscriptionInvoice.findUnique({ where: { id: target.id }, include: { subscription: true } });
      if (!invoice) throw new NotFoundException({ success: false, message: 'Payment not found' });
      if (invoice.provider !== 'cardcom') throw notRefundable('Only card payments (Cardcom) are refunded here');
      return {
        amount: invoice.amount,
        currency: invoice.currency,
        transactionId: invoice.providerInvoiceId,
        refunds: { subscriptionInvoiceId: invoice.id },
        subscription: invoice.subscription,
      };
    }
    await tx.$queryRaw`SELECT id FROM "jewelry_payment_intents" WHERE id = ${target.id}::uuid FOR UPDATE`;
    const intent = await tx.jewelryPaymentIntent.findUnique({ where: { id: target.id } });
    if (!intent) throw new NotFoundException({ success: false, message: 'Payment not found' });
    if (intent.provider !== 'cardcom' || !intent.transactionId || intent.status !== JewelryPaymentStatus.SUCCEEDED) {
      throw notRefundable('Only a jewelry payment taken by card (Cardcom) is refunded here');
    }
    return {
      amount: intent.amount,
      currency: intent.currency,
      transactionId: intent.transactionId,
      refunds: { jewelryPaymentIntentId: intent.id },
      subscription: null,
    };
  }

  /** Reserves the amount (a PENDING refund) under the payment's row lock. */
  private reserve(admin: User, target: Target, input: RefundInput) {
    return this.prisma.$transaction(async (tx) => {
      const paid = await this.payment(tx, target);
      const held = await tx.paymentRefund.aggregate({
        where: { ...paid.refunds, status: { in: HOLDING } },
        _sum: { amount: true },
      });
      const taken = cents(held._sum.amount ?? 0);
      const remaining = cents(paid.amount) - taken;
      const amount = input.amount === undefined ? remaining : cents(input.amount);
      if (amount <= 0 || amount > remaining) {
        throw new BadRequestException({
          success: false,
          message: `At most ${remaining / 100} ${paid.currency} of this payment can still be refunded`,
          code: 'REFUND_EXCEEDS_PAYMENT',
        });
      }
      const created = await tx.paymentRefund.create({
        data: {
          provider: 'cardcom',
          ...paid.refunds,
          transactionId: paid.transactionId,
          amount: new Prisma.Decimal(amount / 100),
          currency: paid.currency,
          reason: input.reason,
          status: 'PENDING',
          requestedById: admin.id,
          requestId: input.requestId ?? null,
        },
      });
      return { refund: created, partial: taken > 0 || amount !== cents(paid.amount), subscription: paid.subscription };
    });
  }

  /** Asks Cardcom for the refund and records its answer (or that none came). */
  private async ask(refund: PaymentRefund, partial: boolean): Promise<PaymentRefund> {
    let answer: CardcomRefund;
    try {
      answer = await this.cardcom.refund({
        transactionId: refund.transactionId,
        ...(partial ? { amount: Number(refund.amount) } : {}),
        externalRefundId: refund.id,
      });
    } catch (err) {
      const unknown = err instanceof CardcomUnavailableError;
      this.logger.error(`Refund ${refund.id} of transaction ${refund.transactionId}: ${(err as Error).message}`);
      return this.prisma.paymentRefund.update({
        where: { id: refund.id },
        data: unknown
          ? { status: 'UNKNOWN', failureReason: 'Cardcom did not answer: check the refund in the Cardcom panel, then settle it here' }
          : { status: 'FAILED', failureReason: (err as Error).message.slice(0, 500), completedAt: new Date() },
      });
    }
    return this.prisma.paymentRefund.update({
      where: { id: refund.id },
      data:
        answer.status === 'REFUNDED'
          ? { status: 'SUCCEEDED', providerRefundId: answer.refundTransactionId, completedAt: new Date() }
          : { status: 'FAILED', failureReason: answer.description.slice(0, 500) || 'Refused by Cardcom', completedAt: new Date() },
    });
  }

  /**
   * A jewelry payment's refunds come off what its jeweler is owed: a payment refunded in full before
   * the transfer cancels the debt (after the transfer, what is due turns negative: to recover).
   */
  private async applyJewelryRefund(intentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "jewelry_payment_intents" WHERE id = ${intentId}::uuid FOR UPDATE`;
      const intent = await tx.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intentId }, include: { refunds: true, payout: true } });
      const refunded = refundedCents(intent.refunds, ['SUCCEEDED']);
      const whole = refunded >= cents(intent.amount);
      if (whole && intent.status === JewelryPaymentStatus.SUCCEEDED) {
        await tx.jewelryPaymentIntent.update({ where: { id: intentId }, data: { status: JewelryPaymentStatus.REFUNDED } });
      }
      if (intent.payout) {
        await tx.jewelerPayout.update({
          where: { id: intent.payout.id },
          data: {
            refundedAmount: new Prisma.Decimal(refunded / 100),
            ...(whole && intent.payout.status === 'OWED' ? { status: 'CANCELLED' } : {}),
          },
        });
      }
    });
  }

  /** A refunded plan that should not continue: it ends now, and nothing renews it. */
  private async endSubscription(userId: string, subscriptionId: string, refundId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const ended = await tx.subscription.updateMany({
        where: { id: subscriptionId, status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
        data: { status: SubscriptionStatus.CANCELLED, cancelAtPeriodEnd: true, pendingPlanId: null },
      });
      if (ended.count === 1) {
        await this.outbox.enqueue('subscription.cancelled', { subscriptionId, userId, reason: 'refunded', refundId }, tx);
      }
    });
  }
}
