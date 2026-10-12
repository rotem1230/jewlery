import { randomUUID } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JewelryPaymentStatus, Prisma, User } from '@prisma/client';
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

@Injectable()
export class JewelryPaymentsService {
  constructor(
    private readonly featureFlags: FeatureFlagsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createIntent(user: User, dto: CreatePaymentIntentDto): Promise<JewelryPaymentIntentView> {
    await this.assertEnabled(user);

    const provider = this.config.get<string>('stripe.secretKey') ? 'stripe' : 'mock';
    const intent = await this.prisma.jewelryPaymentIntent.create({
      data: {
        userId: user.id,
        quoteId: dto.quoteId ?? null,
        designId: dto.designId ?? null,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        status: JewelryPaymentStatus.REQUIRES_CONFIRMATION,
        clientSecret: `mock_secret_${randomUUID()}`,
        provider,
        providerRef: provider === 'mock' ? `mock_${randomUUID()}` : null,
      },
    });

    await this.prisma.paymentEvent.create({
      data: {
        jewelryPaymentIntentId: intent.id,
        provider,
        providerEventId: `${provider}.jewelry.${intent.id}`,
        type: 'jewelry.intent.created',
        payload: {
          intentId: intent.id,
          userId: user.id,
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
        } as Prisma.InputJsonValue,
      },
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

  private toView(intent: {
    id: string;
    status: JewelryPaymentStatus;
    amount: Prisma.Decimal | number | string;
    currency: string;
    designId: string | null;
    quoteId: string | null;
    clientSecret: string;
    provider: string;
    createdAt: Date;
  }): JewelryPaymentIntentView {
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
