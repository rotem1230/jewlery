import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadsModule } from '../uploads/uploads.module';
import { JewelerProfilesController } from './jeweler-profiles.controller';
import { JewelerProfilesService } from './jeweler-profiles.service';

@Module({
  imports: [CmsModule, EntitlementsModule, SubscriptionsModule, UploadsModule],
  controllers: [JewelerProfilesController],
  providers: [JewelerProfilesService],
  exports: [JewelerProfilesService],
})
export class JewelerProfilesModule {}
