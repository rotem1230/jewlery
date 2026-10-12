import { randomUUID } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JewelryPaymentIntent, JewelryPaymentStatus, Prisma, QuoteStatus, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
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
  createdAt: string;
};

const OPEN_STATUSES: JewelryPaymentStatus[] = [
  JewelryPaymentStatus.REQUIRES_CONFIRMATION,
  JewelryPaymentStatus.PROCESSING,
];

function providerNotConfigured(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    success: false,
    message: 'In-app payments are not available yet',
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  });
}

@Injectable()
export class JewelryPaymentsService {
  constructor(
    private readonly featureFlags: FeatureFlagsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The mock provider must be chosen explicitly (PAYMENTS_PROVIDER=mock) and never runs in
   * production. A configured real provider key without an integration fails closed rather than
   * handing the app a fake client secret.
   */
  private resolveProvider(): 'mock' {
    if (this.config.get<string>('stripe.secretKey')) {
      throw providerNotConfigured();
    }
    if (this.config.get<string>('payments.provider') !== 'mock' || this.config.get<string>('nodeEnv') === 'production') {
      throw providerNotConfigured();
    }
    return 'mock';
  }

  async createIntent(user: User, dto: CreatePaymentIntentDto): Promise<JewelryPaymentIntentView> {
    await this.assertEnabled(user);
    const provider = this.resolveProvider();

    const intent = await this.prisma.$transaction(async (tx) => {
      // Serialize per quote so two taps never open two intents for one purchase.
      await tx.$queryRaw`SELECT id FROM "quotes" WHERE id = ${dto.quoteId}::uuid FOR UPDATE`;
      const quote = await tx.quote.findUnique({
        where: { id: dto.quoteId },
        include: { design: { select: { ownerUserId: true } } },
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

      const open = await tx.jewelryPaymentIntent.findFirst({
        where: { quoteId: quote.id, userId: user.id, status: { in: OPEN_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      if (open) {
        return open;
      }

      const created = await tx.jewelryPaymentIntent.create({
        data: {
          userId: user.id,
          quoteId: quote.id,
          designId: quote.designId,
          amount: quote.totalPrice,
          currency: quote.currency,
          status: JewelryPaymentStatus.REQUIRES_CONFIRMATION,
          clientSecret: `mock_secret_${randomUUID()}`,
          provider,
          providerRef: `mock_${randomUUID()}`,
        },
      });

      await tx.paymentEvent.create({
        data: {
          jewelryPaymentIntentId: created.id,
          provider,
          providerEventId: `${provider}.jewelry.${created.id}`,
          type: 'jewelry.intent.created',
          payload: {
            intentId: created.id,
            userId: user.id,
            quoteId: quote.id,
            amount: quote.totalPrice.toString(),
            currency: quote.currency,
          } as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    return this.toView(intent);
  }

  async findOne(id: string, user: User): Promise<JewelryPaymentIntentView> {
    await this.assertEnabled(user);
    const intent = await this.prisma.jewelryPaymentIntent.findFirst({
      where: { id, userId: user.id },
    });
    if (!intent) {
      throw new NotFoundException({ success: false, message: 'Payment intent not found' });
    }
    return this.toView(intent);
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
      createdAt: intent.createdAt.toISOString(),
    };
  }
}
