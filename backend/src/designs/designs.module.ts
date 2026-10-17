import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { UploadsModule } from '../uploads/uploads.module';
import { JewelryModule } from '../jewelry/jewelry.module';
import { WizardModule } from '../wizard/wizard.module';
import { DesignPreviewService } from './design-preview.service';
import { DesignsController } from './designs.controller';
import { DesignsService } from './designs.service';

@Module({
  imports: [CmsModule, WizardModule, UploadsModule, JewelryModule],
  controllers: [DesignsController],
  providers: [DesignsService, DesignPreviewService],
  exports: [DesignsService, DesignPreviewService],
})
export class DesignsModule {}
