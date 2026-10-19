import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminJewelryPaymentsController } from './admin-jewelry-payments.controller';
import { JewelryPaymentsController } from './jewelry-payments.controller';
import { JewelryPaymentsService } from './jewelry-payments.service';

@Module({
  imports: [FeatureFlagsModule, NotificationsModule, SubscriptionsModule],
  controllers: [JewelryPaymentsController, AdminJewelryPaymentsController],
  providers: [JewelryPaymentsService],
  exports: [JewelryPaymentsService],
})
export class JewelryPaymentsModule {}
