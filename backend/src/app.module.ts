import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { AtelierModule } from './atelier/atelier.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './authorization/guards/jwt-auth.guard';
import { RolesGuard } from './authorization/guards/roles.guard';
import { ChatModule } from './chat/chat.module';
import { CmsModule } from './cms/cms.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { StateMachineModule } from './common/state-machine/state-machine.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { DesignsModule } from './designs/designs.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { GalleryModule } from './gallery/gallery.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { JewelerProfilesModule } from './jeweler-profiles/jeweler-profiles.module';
import { JewelryPaymentsModule } from './jewelry-payments/jewelry-payments.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { MasterDataModule } from './master-data/master-data.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PromotionsModule } from './promotions/promotions.module';
import { QuotesModule } from './quotes/quotes.module';
import { RedisModule } from './redis/redis.module';
import { RenderJobsModule } from './render-jobs/render-jobs.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { VisualizationModule } from './visualization/visualization.module';
import { WizardModule } from './wizard/wizard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttlMs', 60_000),
          limit: config.get<number>('throttle.limit', 100),
        },
      ],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('redisUrl');
        const url = redisUrl ? new URL(redisUrl) : undefined;
        return {
          connection: {
            host: url?.hostname ?? '127.0.0.1',
            port: url ? Number(url.port || 6379) : 6379,
            password: url?.password || undefined,
            maxRetriesPerRequest: null,
            lazyConnect: true,
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    StateMachineModule,
    OutboxModule,
    AuthModule,
    UsersModule,
    CmsModule,
    FeatureFlagsModule,
    UploadsModule,
    MailModule,
    EntitlementsModule,
    WizardModule,
    DesignsModule,
    GalleryModule,
    MasterDataModule,
    HomeModule,
    ChatModule,
    QuotesModule,
    NotificationsModule,
    SubscriptionsModule,
    RenderJobsModule,
    AiModule,
    JewelerProfilesModule,
    ReviewsModule,
    PromotionsModule,
    VisualizationModule,
    JewelryPaymentsModule,
    AtelierModule,
    AdminModule,
    JobsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
