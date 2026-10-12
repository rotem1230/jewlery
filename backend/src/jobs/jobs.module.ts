import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisualizationModule } from '../visualization/visualization.module';
import { JobsScheduler } from './jobs.scheduler';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'outbox' }, { name: 'mail' }, { name: 'viz-purge' }),
    MailModule,
    NotificationsModule,
    VisualizationModule,
  ],
  providers: [JobsScheduler],
})
export class JobsModule {}
