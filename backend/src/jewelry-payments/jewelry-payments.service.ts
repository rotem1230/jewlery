import { randomUUID } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JewelryPaymentIntent, JewelryPaymentStatus, Prisma, QuoteStatus, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { CardcomClient, CardcomUnavailableError } from '../common/payments/cardcom.client';
import { resolvePaymentProvider } from '../common/payments/payment-provider';
import { PrismaService } from '../database/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CardcomPaymentsService } from '../subscriptions/cardcom-payments.service';
import { cardcomUrls } from '../subscriptions/cardcom-urls';
import { paymentProviderUnavailable } from '../subscriptions/payment-provider-errors';
import { cents, HOLDING, refundedCents, refundView } from '../subscriptions/refunds.service';
import { CreatePaymentIntentDto } from './dto/jewelry-payment.dto';

export type JewelryPaymentIntentView = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  designId: string | null;
  quoteId: string | null;
  clientSecret: string;
  provider: string;
  /** The Cardcom page the app opens (null for the mock provider). */
  paymentUrl: string | null;
  createdAt: string;
};

const OPEN_STATUSES: JewelryPaymentStatus[] = [
  JewelryPaymentStatus.REQUIRES_CONFIRMATION,
  JewelryPaymentStatus.PROCESSING,
];
/** An open Cardcom page is offered again for this long; after that a fresh one is opened. */
const PAGE_REUSE_MS = 20 * 60 * 1000;
const MAX_LISTED = 200;

/**
 * Jewelry payments (PRD phase 3): the designer pays an accepted quote. With Cardcom the money comes
 * to the platform on a payment page; once Cardcom confirms the deal (LowProfile/GetLpResult — its
 * notification is not signed), the payment succeeds and the jeweler is owed it less the platform's
 * commission (JEWELRY_COMMISSION_PERCENT), transferred by hand and marked paid by an admin.
 */
@Injectable()
export class JewelryPaymentsService implements OnModuleInit {
  private readonly logger = new Logger(JewelryPaymentsService.name);

  constructor(
    private readonly featureFlags: FeatureFlagsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cardcom: CardcomClient,
    private readonly cardcomPages: CardcomPaymentsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.cardcomPages.registerPageHandler(async (lowProfileId) => {
      const intent = await this.prisma.jewelryPaymentIntent.findUnique({ where: { providerRef: lowProfileId } });
      if (!intent || intent.provider !== 'cardcom') return false;
      await this.confirm(intent);
      return true;
    });
    this.cardcomPages.registerReturnHandler('jewelry', (intentId) => this.confirmQuietly(intentId));
  }

  async createIntent(user: User, dto: CreatePaymentIntentDto): Promise<JewelryPaymentIntentView> {
    await this.assertEnabled(user);
    const provider = resolvePaymentProvider(this.config, ['mock', 'cardcom']);

    const { intent, open, title } = await this.prisma.$transaction(async (tx) => {
      // Serialize per quote so two taps never open two intents for one purchase.
      await tx.$queryRaw`SELECT id FROM "quotes" WHERE id = ${dto.quoteId}::uuid FOR UPDATE`;
      const quote = await tx.quote.findUnique({
        where: { id: dto.quoteId },
        include: { design: { select: { ownerUserId: true, title: true } } },
      });
      if (!quote) {
        throw new NotFoundException({ success: false, message: 'Quote not found' });
      }
      if (quote.design.ownerUserId !== user.id) {
        throw new ForbiddenException({ success: false, message: 'Only the design owner can pay this quote' });
      }
      if (quote.status !== QuoteStatus.ACCEPTED) {
        throw new ConflictException({
          success: false,
          message: 'Only an accepted quote can be paid',
          code: 'QUOTE_NOT_ACCEPTED',
        });
      }
      const paid = await tx.jewelryPaymentIntent.count({ where: { quoteId: quote.id, status: JewelryPaymentStatus.SUCCEEDED } });
      if (paid > 0) {
        throw new ConflictException({ success: false, message: 'This quote was already paid', code: 'QUOTE_ALREADY_PAID' });
      }

      const existing = await tx.jewelryPaymentIntent.findFirst({
        where: { quoteId: quote.id, userId: user.id, status: { in: OPEN_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      const reusable =
        existing &&
        (provider !== 'cardcom' || (existing.provider === 'cardcom' && existing.paymentUrl && Date.now() - existing.createdAt.getTime() < PAGE_REUSE_MS));
      if (existing && reusable) {
        return { intent: existing, open: true, title: quote.design.title };
      }
      if (existing) {
        // An older page is withdrawn; a payment made on it still counts (see confirm()).
        await tx.jewelryPaymentIntent.update({ where: { id: existing.id }, data: { status: JewelryPaymentStatus.CANCELLED } });
      }

      const created = await tx.jewelryPaymentIntent.create({
        data: {
          userId: user.id,
          quoteId: quote.id,
          designId: quote.designId,
          amount: quote.totalPrice,
          currency: quote.currency,
          status: JewelryPaymentStatus.REQUIRES_CONFIRMATION,
          clientSecret: provider === 'mock' ? `mock_secret_${randomUUID()}` : '',
          provider,
          providerRef: provider === 'mock' ? `mock_${randomUUID()}` : null,
        },
      });

      await tx.paymentEvent.create({
        data: {
          jewelryPaymentIntentId: created.id,
          provider,
          providerEventId: `${provider}.jewelry.${created.id}`,
          type: 'jewelry.intent.created',
          // A record of the intent; no money has moved.
          outcome: 'IGNORED',
          note: 'Payment intent created',
          payload: {
            intentId: created.id,
            userId: user.id,
            quoteId: quote.id,
            amount: quote.totalPrice.toString(),
            currency: quote.currency,
          } as Prisma.InputJsonValue,
        },
      });
      return { intent: created, open: false, title: quote.design.title };
    });

    if (provider !== 'cardcom' || open) {
      return this.toView(intent);
    }
    return this.toView(await this.openPage(intent, user, title));
  }

  async findOne(id: string, user: User): Promise<JewelryPaymentIntentView> {
    await this.assertEnabled(user);
    let intent = await this.prisma.jewelryPaymentIntent.findFirst({
      where: { id, userId: user.id },
    });
    if (!intent) {
      throw new NotFoundException({ success: false, message: 'Payment intent not found' });
    }
    if (intent.provider === 'cardcom' && OPEN_STATUSES.includes(intent.status)) {
      await this.confirmQuietly(intent.id);
      intent = await this.prisma.jewelryPaymentIntent.findUniqueOrThrow({ where: { id } });
    }
    return this.toView(intent);
  }

  /** Jewelry payments for the admin: who paid whom, what was refunded and what is left. */
  async listForAdmin(query: { from?: Date; to?: Date }) {
    const intents = await this.prisma.jewelryPaymentIntent.findMany({
      where: {
        provider: 'cardcom',
        status: { in: [JewelryPaymentStatus.SUCCEEDED, JewelryPaymentStatus.REFUNDED] },
        ...(query.from || query.to ? { paidAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } } : {}),
      },
      include: {
        refunds: { orderBy: { createdAt: 'asc' } },
        payout: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        quote: { select: { id: true, author: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      },
      orderBy: { paidAt: 'desc' },
      take: MAX_LISTED,
    });
    const person = (u: { id: string; email: string; firstName: string | null; lastName: string | null } | null | undefined) =>
      u ? { id: u.id, email: u.email, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null } : null;
    return intents.map((intent) => ({
      id: intent.id,
      status: intent.status,
      amount: Number(intent.amount),
      currency: intent.currency,
      paidAt: intent.paidAt,
      transactionId: intent.transactionId,
      designer: person(intent.user),
      jeweler: person(intent.quote?.author),
      quoteId: intent.quoteId,
      refunded: refundedCents(intent.refunds, ['SUCCEEDED']) / 100,
      refundable: intent.status === JewelryPaymentStatus.SUCCEEDED ? Math.max(0, cents(intent.amount) - refundedCents(intent.refunds, HOLDING)) / 100 : 0,
      refunds: intent.refunds.map(refundView),
      payoutStatus: intent.payout?.status ?? null,
    }));
  }

  /** What is owed to jewelers (or was paid, or cancelled), with what is due after refunds. */
  async listPayouts(query: { status?: string }) {
    const payouts = await this.prisma.jewelerPayout.findMany({
      where: query.status ? { status: query.status } : {},
      include: {
        jeweler: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, jewelerProfile: { select: { businessName: true, phone: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED,
    });
    return payouts.map((payout) => ({
      id: payout.id,
      paymentId: payout.jewelryPaymentIntentId,
      quoteId: payout.quoteId,
      status: payout.status,
      currency: payout.currency,
      gross: Number(payout.grossAmount),
      commission: Number(payout.commissionAmount),
      net: Number(payout.netAmount),
      refunded: Number(payout.refundedAmount),
      /** Still to transfer (OWED), or to recover after a refund made since the transfer (PAID, < 0). */
      due:
        payout.status === 'CANCELLED'
          ? 0
          : (cents(payout.netAmount) - cents(payout.refundedAmount) - (payout.status === 'PAID' ? cents(payout.netAmount) : 0)) / 100,
      paidAt: payout.paidAt,
      paidReference: payout.paidReference,
      createdAt: payout.createdAt,
      jeweler: {
        id: payout.jeweler.id,
        email: payout.jeweler.email,
        name: [payout.jeweler.firstName, payout.jeweler.lastName].filter(Boolean).join(' ') || null,
        businessName: payout.jeweler.jewelerProfile?.businessName ?? null,
        phone: payout.jeweler.jewelerProfile?.phone ?? payout.jeweler.phone ?? null,
      },
    }));
  }

  /** An admin transferred what was owed: recorded once, with the transfer's reference. */
  async markPayoutPaid(admin: User, payoutId: string, reference: string) {
    const updated = await this.prisma.jewelerPayout.updateMany({
      where: { id: payoutId, status: 'OWED' },
      data: { status: 'PAID', paidAt: new Date(), paidReference: reference, markedById: admin.id },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.jewelerPayout.count({ where: { id: payoutId } });
      if (!exists) throw new NotFoundException({ success: false, message: 'Payout not found' });
      throw new ConflictException({ success: false, message: 'Only an owed payout is marked as transferred', code: 'PAYOUT_NOT_OWED' });
    }
    const payout = await this.prisma.jewelerPayout.findUniqueOrThrow({ where: { id: payoutId } });
    await this.audit.log({
      actorUserId: admin.id,
      action: 'jeweler_payout.paid',
      entityType: 'JewelerPayout',
      entityId: payout.id,
      after: toJsonValue(payout),
    });
    return { id: payout.id, status: payout.status, paidAt: payout.paidAt, paidReference: payout.paidReference };
  }

  /** Opens the Cardcom page for this payment (a one-off charge with its receipt). */
  private async openPage(intent: JewelryPaymentIntent, user: User, designTitle: string | null): Promise<JewelryPaymentIntent> {
    let page;
    try {
      page = await this.cardcom.createPaymentPage({
        operation: 'ChargeOnly',
        amount: Number(intent.amount),
        currency: intent.currency,
        returnValue: intent.id,
        ...cardcomUrls(this.config, 'jewelry', intent.id),
        productName: designTitle ? `תכשיט לפי הצעת מחיר — ${designTitle}` : 'תכשיט לפי הצעת מחיר',
        customer: { name: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.email },
      });
    } catch (err) {
      await this.prisma.jewelryPaymentIntent.update({ where: { id: intent.id }, data: { status: JewelryPaymentStatus.CANCELLED } });
      this.logger.warn(`Cardcom could not open a page for jewelry payment ${intent.id}: ${(err as Error).message}`);
      throw paymentProviderUnavailable();
    }
    return this.prisma.jewelryPaymentIntent.update({
      where: { id: intent.id },
      data: { providerRef: page.lowProfileId.toLowerCase(), paymentUrl: page.url },
    });
  }

  /** The buyer came back, or follows the payment: confirmed with Cardcom (an outage leaves it open). */
  private async confirmQuietly(intentId: string): Promise<void> {
    const intent = await this.prisma.jewelryPaymentIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.provider !== 'cardcom') return;
    try {
      await this.confirm(intent);
    } catch (err) {
      this.logger.warn(`Jewelry payment ${intentId} could not be confirmed with Cardcom now: ${(err as Error).message}`);
    }
  }

  /**
   * A payment page Cardcom confirms paid: the payment succeeds (once, keyed by the page) and the
   * jeweler is owed it less the commission. Money that does not match the payment (amount, currency,
   * another payment, a quote already paid) is recorded for review, never applied.
   */
  private async confirm(intent: JewelryPaymentIntent): Promise<void> {
    if (!intent.providerRef || intent.status === JewelryPaymentStatus.SUCCEEDED || intent.status === JewelryPaymentStatus.REFUNDED) return;
    let result;
    try {
      result = await this.cardcom.getPaymentPageResult(intent.providerRef);
    } catch (err) {
      if (err instanceof CardcomUnavailableError) throw paymentProviderUnavailable();
      throw err;
    }
    if (!result.paid) return;

    const commissionPct = this.config.get<number>('payments.jewelryCommissionPercent') ?? 0;
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "jewelry_payment_intents" WHERE id = ${intent.id}::uuid FOR UPDATE`;
      const current = await tx.jewelryPaymentIntent.findUniqueOrThrow({ where: { id: intent.id }, include: { quote: true } });
      const providerEventId = `lp:${intent.providerRef}`;
      if (await tx.paymentEvent.count({ where: { provider: 'cardcom', providerEventId } })) return 'DUPLICATE';

      const otherPaid = current.quoteId
        ? await tx.jewelryPaymentIntent.count({ where: { quoteId: current.quoteId, status: JewelryPaymentStatus.SUCCEEDED, id: { not: current.id } } })
        : 0;
      const expected = `${Number(current.amount)} ${current.currency}`;
      const problem =
        result.returnValue !== current.id
          ? `Cardcom confirmed page ${intent.providerRef} for ${result.returnValue ?? 'nothing'}, not payment ${current.id}`
          : result.amount === null || cents(result.amount) !== cents(current.amount) || result.currency !== current.currency
            ? `Paid ${result.amount ?? '?'} ${result.currency ?? '?'} for a payment of ${expected}`
            : otherPaid > 0
              ? `Second payment for quote ${current.quoteId} (already paid): to refund`
              : null;
      await tx.paymentEvent.create({
        data: {
          jewelryPaymentIntentId: current.id,
          provider: 'cardcom',
          providerEventId,
          type: 'jewelry.payment_succeeded',
          payload: { lowProfileId: intent.providerRef, transactionId: result.transactionId, description: result.description } as Prisma.InputJsonValue,
          invoiceId: result.transactionId,
          amount: result.amount === null ? null : new Prisma.Decimal(result.amount),
          currency: result.currency,
          outcome: problem ? 'NEEDS_REVIEW' : 'APPLIED',
          note: problem,
        },
      });
      if (problem) return 'REVIEW';

      await tx.jewelryPaymentIntent.update({
        where: { id: current.id },
        data: { status: JewelryPaymentStatus.SUCCEEDED, transactionId: result.transactionId, paidAt: new Date() },
      });
      if (current.quote) {
        const gross = cents(current.amount);
        const commission = Math.round((gross * commissionPct) / 100);
        await tx.jewelerPayout.create({
          data: {
            jewelryPaymentIntentId: current.id,
            jewelerUserId: current.quote.authorUserId,
            quoteId: current.quote.id,
            grossAmount: new Prisma.Decimal(gross / 100),
            commissionAmount: new Prisma.Decimal(commission / 100),
            netAmount: new Prisma.Decimal((gross - commission) / 100),
            currency: current.currency,
            status: 'OWED',
          },
        });
        return { jewelerUserId: current.quote.authorUserId, quoteId: current.quote.id };
      }
      return 'APPLIED';
    });

    if (outcome === 'REVIEW') {
      this.logger.error(`Jewelry payment ${intent.id}: a Cardcom payment was kept for review`);
    }
    if (outcome && typeof outcome === 'object') {
      await this.notifications
        .createInApp(outcome.jewelerUserId, 'jewelry_payment.received', 'Payment received for an order', 'The designer paid your quote in the app.', {
          quoteId: outcome.quoteId,
          paymentId: intent.id,
        })
        .catch((err: Error) => this.logger.warn(`Notifying the jeweler of payment ${intent.id} failed: ${err.message}`));
    }
  }

  private async assertEnabled(user: User): Promise<void> {
    const enabled = await this.featureFlags.isEnabled('phase3_jewelry_pay', user);
    if (!enabled) {
      throw new ForbiddenException({
        success: false,
        message: 'Jewelry payments are not enabled',
        code: 'FEATURE_DISABLED',
      });
    }
  }

  private toView(intent: JewelryPaymentIntent): JewelryPaymentIntentView {
    return {
      id: intent.id,
      status: intent.status.toLowerCase(),
      amount: Number(intent.amount),
      currency: intent.currency,
      designId: intent.designId,
      quoteId: intent.quoteId,
      clientSecret: intent.clientSecret,
      provider: intent.provider,
      paymentUrl: intent.paymentUrl,
      createdAt: intent.createdAt.toISOString(),
    };
  }
}
