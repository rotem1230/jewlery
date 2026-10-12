import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentEvent, Prisma, Subscription, PlanCatalog, SubscriptionStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventLogService } from '../audit/event-log.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { PrismaService } from '../database/prisma.service';
import { billingCyclePeriodMs } from './billing-periods';
import { PaymentWebhookDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';
import { verifyWebhookSignature } from './webhook-signature';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stateMachine: StateMachineService,
    private readonly subscriptions: SubscriptionsService,
    private readonly eventLog: EventLogService,
  ) {}

  /**
   * Verifies the provider signature over the raw body BEFORE parsing anything, then records the
   * event and applies its effect in one transaction keyed by the unique providerEventId, so a
   * redelivered (or concurrently duplicated) event is applied exactly once.
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
      const event = await this.prisma.$transaction(async (tx) => {
        const subscription = dto.subscriptionId
          ? await tx.subscription.findUnique({ where: { id: dto.subscriptionId }, include: { plan: true } })
          : null;
        const created = await tx.paymentEvent.create({
          data: {
            subscriptionId: subscription?.id ?? null,
            provider: dto.provider,
            providerEventId: dto.providerEventId,
            type: dto.type,
            payload: dto.payload as Prisma.InputJsonValue,
          },
        });
        if (subscription) {
          await this.applyEffects(tx, subscription, dto.type);
        }
        return created;
      });
      await this.eventLog.record('payment.webhook', 'PaymentEvent', event.id, {
        provider: dto.provider,
        type: dto.type,
        subscriptionId: event.subscriptionId,
      });
      return event;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`Duplicate payment event ${dto.providerEventId} ignored`);
        return this.prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: dto.providerEventId } });
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
    const dto = plainToInstance(PaymentWebhookDto, body);
    const errors = await validate(dto as object, { forbidUnknownValues: true });
    if (errors.length > 0 || typeof body !== 'object' || body === null) {
      throw new BadRequestException({ success: false, message: 'Webhook body failed validation' });
    }
    return dto;
  }

  private async applyEffects(
    tx: Tx,
    subscription: Subscription & { plan: PlanCatalog },
    type: string,
  ): Promise<void> {
    const graph = this.stateMachine.subscriptionGraph;
    switch (type) {
      case 'invoice.paid':
      case 'payment.succeeded': {
        if (!this.stateMachine.canTransition(graph, subscription.status, SubscriptionStatus.ACTIVE)) {
          return;
        }
        const now = new Date();
        const start = subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
        const end = new Date(start.getTime() + billingCyclePeriodMs(subscription.billingCycle));
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end },
        });
        await this.subscriptions.allocateLeads(tx, subscription, subscription.plan, start, end);
        return;
      }
      case 'invoice.payment_failed':
      case 'payment.failed':
        if (this.stateMachine.canTransition(graph, subscription.status, SubscriptionStatus.PAST_DUE)) {
          await tx.subscription.update({ where: { id: subscription.id }, data: { status: SubscriptionStatus.PAST_DUE } });
        }
        return;
      case 'subscription.cancelled':
        if (this.stateMachine.canTransition(graph, subscription.status, SubscriptionStatus.CANCELLED)) {
          await tx.subscription.update({ where: { id: subscription.id }, data: { status: SubscriptionStatus.CANCELLED } });
        }
        return;
      default:
        return;
    }
  }
}
