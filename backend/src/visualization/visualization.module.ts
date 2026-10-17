import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { JewelryModule } from '../jewelry/jewelry.module';
import { UploadsModule } from '../uploads/uploads.module';
import { VisualizationController } from './visualization.controller';
import { VisualizationService } from './visualization.service';

@Module({
  imports: [CmsModule, EntitlementsModule, FeatureFlagsModule, UploadsModule, JewelryModule],
  controllers: [VisualizationController],
  providers: [VisualizationService],
  exports: [VisualizationService],
})
export class VisualizationModule {}
