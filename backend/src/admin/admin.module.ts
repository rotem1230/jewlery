import { Module } from '@nestjs/common';
import { AdminCmsController } from '../cms/admin-cms.controller';
import { CmsModule } from '../cms/cms.module';
import { AdminDesignsController } from '../designs/admin-designs.controller';
import { DesignsModule } from '../designs/designs.module';
import { AdminFeatureFlagsController } from '../feature-flags/admin-feature-flags.controller';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminGalleryController } from '../gallery/admin-gallery.controller';
import { GalleryModule } from '../gallery/gallery.module';
import { AdminJewelerProfilesController } from '../jeweler-profiles/admin-jeweler-profiles.controller';
import { JewelerProfilesModule } from '../jeweler-profiles/jeweler-profiles.module';
import { AdminMasterDataController } from '../master-data/admin-master-data.controller';
import { MasterDataModule } from '../master-data/master-data.module';
import { AdminPromotionsController } from '../promotions/admin-promotions.controller';
import { PromotionsModule } from '../promotions/promotions.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    CmsModule,
    FeatureFlagsModule,
    DesignsModule,
    GalleryModule,
    MasterDataModule,
    JewelerProfilesModule,
    PromotionsModule,
  ],
  controllers: [
    AdminController,
    AdminCmsController,
    AdminFeatureFlagsController,
    AdminDesignsController,
    AdminGalleryController,
    AdminMasterDataController,
    AdminJewelerProfilesController,
    AdminPromotionsController,
  ],
})
export class AdminModule {}
