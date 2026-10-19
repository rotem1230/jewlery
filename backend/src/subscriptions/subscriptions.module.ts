import { Module } from '@nestjs/common';
import { CardcomClient } from '../common/payments/cardcom.client';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { CardcomPaymentsService } from './cardcom-payments.service';
import { CardcomReturnController } from './cardcom-return.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPlansController } from './admin-plans.controller';
import { AdminPlansService } from './admin-plans.service';
import { RefundsService } from './refunds.service';
import { SubscriptionsController } from './subscriptions.controller';
import { CheckoutService } from './checkout.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionsService } from './subscriptions.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [EntitlementsModule],
  controllers: [SubscriptionsController, WebhooksController, CardcomReturnController, AdminPaymentsController, AdminPlansController],
  providers: [
    SubscriptionsService,
    SubscriptionLifecycleService,
    PaymentWebhookService,
    CheckoutService,
    CardcomClient,
    CardcomPaymentsService,
    RefundsService,
    AdminPlansService,
  ],
  exports: [SubscriptionsService, SubscriptionLifecycleService, CardcomClient, CardcomPaymentsService, RefundsService],
})
export class SubscriptionsModule {}
