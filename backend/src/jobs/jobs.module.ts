import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotesModule } from '../quotes/quotes.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { VisualizationModule } from '../visualization/visualization.module';
import { JobsScheduler } from './jobs.scheduler';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'outbox' }, { name: 'mail' }, { name: 'viz-purge' }),
    AiModule,
    MailModule,
    NotificationsModule,
    QuotesModule,
    SubscriptionsModule,
    VisualizationModule,
  ],
  providers: [JobsScheduler],
})
export class JobsModule {}
