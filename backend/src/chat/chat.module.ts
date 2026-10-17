import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { jwtModuleOptions } from '../auth/jwt-options';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ChatGateway } from './chat.gateway';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: jwtModuleOptions,
    }),
    UploadsModule,
    NotificationsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ChatGateway],
  // Quote cards are chat messages: modules posting them sign their media like the chat does.
  exports: [ConversationsService, ChatGateway],
})
export class ChatModule {}
