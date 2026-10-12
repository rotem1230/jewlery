import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { JewelerProfilesController } from './jeweler-profiles.controller';
import { JewelerProfilesService } from './jeweler-profiles.service';

@Module({
  imports: [CmsModule, EntitlementsModule],
  controllers: [JewelerProfilesController],
  providers: [JewelerProfilesService],
  exports: [JewelerProfilesService],
})
export class JewelerProfilesModule {}
