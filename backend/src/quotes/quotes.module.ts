import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DesignQuotesController } from './design-quotes.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ChatModule, NotificationsModule],
  controllers: [QuotesController, DesignQuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
