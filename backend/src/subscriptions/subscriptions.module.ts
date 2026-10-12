import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { SubscriptionsController } from './subscriptions.controller';
import { CheckoutService } from './checkout.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionsService } from './subscriptions.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [EntitlementsModule],
  controllers: [SubscriptionsController, WebhooksController],
  providers: [SubscriptionsService, SubscriptionLifecycleService, PaymentWebhookService, CheckoutService],
  exports: [SubscriptionsService, SubscriptionLifecycleService],
})
export class SubscriptionsModule {}
