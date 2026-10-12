import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentEvent, PlanCatalog, Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventLogService } from '../audit/event-log.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { PrismaService } from '../database/prisma.service';
import { billingCyclePeriodMs } from './billing-periods';
import { PaymentWebhookDto } from './dto/subscription.dto';
import { CheckoutService } from './checkout.service';
import { SubscriptionsService } from './subscriptions.service';
import { verifyWebhookSignature } from './webhook-signature';

type Tx = Prisma.TransactionClient;

export type PaymentOutcome = 'APPLIED' | 'IGNORED' | 'NEEDS_REVIEW';
export type AppliedEvent = { outcome: PaymentOutcome; note?: string; subscriptionId?: string | null };

type LockedSubscription = Subscription & { plan: PlanCatalog };

const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

function sameMoney(amount: number | undefined, currency: string | undefined, price: Prisma.Decimal, priceCurrency: string) {
  return (
    amount !== undefined &&
    currency !== undefined &&
    new Prisma.Decimal(amount).equals(price) &&
    currency.toUpperCase() === priceCurrency.toUpperCase()
  );
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stateMachine: StateMachineService,
    private readonly subscriptions: SubscriptionsService,
    private readonly checkout: CheckoutService,
    private readonly eventLog: EventLogService,
  ) {}

  /**
   * Verifies the provider signature over the raw body BEFORE parsing anything, then records the
   * event and applies its effect in one transaction keyed by (provider, providerEventId), so a
   * redelivered (or concurrently duplicated) event is applied exactly once. Every event is stored
   * with its outcome: money that cannot be applied safely is kept as NEEDS_REVIEW, never dropped.
   */
  async handle(rawBody: Buffer | undefined, signature: string | undefined): Promise<PaymentEvent> {
    const secret = this.config.get<string>('payments.webhookSecret', '');
    if (!secret) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'Payment webhooks are not configured',
        code: 'WEBHOOK_NOT_CONFIGURED',
      });
    }
    const signed =
      !!rawBody &&
      verifyWebhookSignature({
        rawBody,
        header: signature,
        secret,
        toleranceSeconds: this.config.get<number>('payments.webhookToleranceSeconds', 300),
      });
    if (!signed) {
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid webhook signature',
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
    }

    const dto = await this.parse(rawBody as Buffer);

    try {
      const event = await this.prisma.$transaction(
        async (tx) => {
          const created = await tx.paymentEvent.create({
            data: {
              provider: dto.provider,
              providerEventId: dto.providerEventId,
              type: dto.type,
              payload: dto.payload as Prisma.InputJsonValue,
            },
          });
          const applied = await this.apply(tx, dto);
          return tx.paymentEvent.update({
            where: { id: created.id },
            data: { outcome: applied.outcome, note: applied.note ?? null, subscriptionId: applied.subscriptionId ?? null },
          });
        },
        { maxWait: 5_000, timeout: 15_000 },
      );
      if (event.outcome === 'NEEDS_REVIEW') {
        this.logger.error(`Payment event ${event.id} (${dto.provider}/${dto.providerEventId}) needs review: ${event.note}`);
      }
      await this.eventLog.record('payment.webhook', 'PaymentEvent', event.id, {
        provider: dto.provider,
        type: dto.type,
        outcome: event.outcome,
        subscriptionId: event.subscriptionId,
      });
      return event;
    } catch (err) {
      const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
      const duplicateEvent =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        JSON.stringify(target ?? '').includes('providerEventId');
      if (duplicateEvent) {
        this.logger.log(`Duplicate payment event ${dto.provider}/${dto.providerEventId} ignored`);
        return this.prisma.paymentEvent.findUniqueOrThrow({
          where: { provider_providerEventId: { provider: dto.provider, providerEventId: dto.providerEventId } },
        });
      }
      throw err;
    }
  }

  private async parse(rawBody: Buffer): Promise<PaymentWebhookDto> {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException({ success: false, message: 'Webhook body is not valid JSON' });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException({ success: false, message: 'Webhook body failed validation' });
    }
    const dto = plainToInstance(PaymentWebhookDto, body);
    const errors = await validate(dto as object, { forbidUnknownValues: true });
    if (errors.length > 0) {
      throw new BadRequestException({ success: false, message: 'Webhook body failed validation' });
    }
    return dto;
  }

  private async apply(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    switch (dto.type) {
      case 'checkout.completed':
        return this.checkout.completeFromWebhook(tx, dto);
      case 'invoice.paid':
        return this.applyPaidInvoice(tx, dto);
      case 'invoice.payment_failed':
        return this.applyFailedPayment(tx, dto);
      case 'subscription.cancelled':
        return this.applyCancellation(tx, dto);
      default: {
        const known = dto.subscriptionId
          ? await tx.subscription.findUnique({ where: { id: dto.subscriptionId }, select: { id: true } })
          : null;
        return { outcome: 'IGNORED', note: `No effect for event type ${dto.type}`, subscriptionId: known?.id ?? null };
      }
    }
  }

  /**
   * The subscription with its owner's row lock (the lock every subscription writer takes, so this
   * cannot interleave with subscribe / checkout) and its own row lock (so the lifecycle sweep
   * waits for this decision instead of overwriting it).
   */
  private async lockedSubscription(tx: Tx, subscriptionId: string | undefined): Promise<LockedSubscription | null> {
    if (!subscriptionId) {
      return null;
    }
    const owner = await tx.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true } });
    if (!owner) {
      return null;
    }
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${owner.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "subscriptions" WHERE id = ${subscriptionId}::uuid FOR UPDATE`;
    return tx.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
  }

  /**
   * A paid renewal invoice: applied once per invoice id, only for the plan's exact price, extending
   * the paid period from where it ends (or from now, reactivating a subscription that lapsed while
   * the payment was on its way, if the user has not started another one meanwhile).
   */
  private async applyPaidInvoice(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    const sub = await this.lockedSubscription(tx, dto.subscriptionId);
    if (!sub) {
      return { outcome: 'NEEDS_REVIEW', note: 'Paid invoice for an unknown subscription' };
    }
    const subscriptionId = sub.id;
    if (!dto.invoiceId) {
      return { outcome: 'NEEDS_REVIEW', note: 'Paid invoice without an invoice id', subscriptionId };
    }
    if (!sameMoney(dto.amount, dto.currency, sub.plan.price, sub.plan.currency)) {
      return {
        outcome: 'NEEDS_REVIEW',
        note: `Paid ${dto.amount ?? '?'} ${dto.currency ?? '?'} but the plan costs ${sub.plan.price.toString()} ${sub.plan.currency}`,
        subscriptionId,
      };
    }
    const seen = await tx.subscriptionInvoice.findUnique({
      where: { subscriptionId_providerInvoiceId: { subscriptionId, providerInvoiceId: dto.invoiceId } },
    });
    if (seen) {
      return { outcome: 'IGNORED', note: 'Invoice already applied', subscriptionId };
    }

    const now = new Date();
    let start: Date;
    if (sub.status === SubscriptionStatus.CANCELLED) {
      return { outcome: 'NEEDS_REVIEW', note: 'Payment for a cancelled subscription', subscriptionId };
    }
    if (sub.status === SubscriptionStatus.EXPIRED) {
      const other = await tx.subscription.findFirst({
        where: { userId: sub.userId, status: { in: LIVE_STATUSES }, id: { not: sub.id } },
        select: { id: true },
      });
      if (other) {
        return { outcome: 'NEEDS_REVIEW', note: 'Payment for a lapsed subscription the user has replaced', subscriptionId };
      }
      start = now;
    } else {
      start = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    }
    const end = new Date(start.getTime() + billingCyclePeriodMs(sub.billingCycle));

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        ...(sub.status === SubscriptionStatus.EXPIRED ? { cancelAtPeriodEnd: false } : {}),
      },
    });
    await tx.subscriptionInvoice.create({
      data: {
        subscriptionId,
        providerInvoiceId: dto.invoiceId,
        amount: new Prisma.Decimal(dto.amount as number),
        currency: (dto.currency as string).toUpperCase(),
        periodStart: start,
        periodEnd: end,
      },
    });
    await this.subscriptions.allocateLeads(tx, sub, sub.plan, start, end);
    return { outcome: 'APPLIED', subscriptionId };
  }

  /** A failed charge matters only once the paid (or trial) period is over; a late notice is ignored. */
  private async applyFailedPayment(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    const sub = await this.lockedSubscription(tx, dto.subscriptionId);
    if (!sub) {
      return { outcome: 'IGNORED', note: 'Failed payment for an unknown subscription' };
    }
    const graph = this.stateMachine.subscriptionGraph;
    if (sub.currentPeriodEnd > new Date()) {
      return { outcome: 'IGNORED', note: 'The paid period is still running', subscriptionId: sub.id };
    }
    if (!this.stateMachine.canTransition(graph, sub.status, SubscriptionStatus.PAST_DUE)) {
      return { outcome: 'IGNORED', note: `Subscription is ${sub.status}`, subscriptionId: sub.id };
    }
    await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.PAST_DUE } });
    return { outcome: 'APPLIED', subscriptionId: sub.id };
  }

  private async applyCancellation(tx: Tx, dto: PaymentWebhookDto): Promise<AppliedEvent> {
    const sub = await this.lockedSubscription(tx, dto.subscriptionId);
    if (!sub) {
      return { outcome: 'IGNORED', note: 'Cancellation for an unknown subscription' };
    }
    if (!this.stateMachine.canTransition(this.stateMachine.subscriptionGraph, sub.status, SubscriptionStatus.CANCELLED)) {
      return { outcome: 'IGNORED', note: `Subscription is ${sub.status}`, subscriptionId: sub.id };
    }
    await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.CANCELLED } });
    return { outcome: 'APPLIED', subscriptionId: sub.id };
  }
}
