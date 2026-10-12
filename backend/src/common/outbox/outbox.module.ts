import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { OutboxProcessor } from './outbox.processor';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService, OutboxProcessor],
})
export class OutboxModule {}
