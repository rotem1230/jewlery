import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { WizardModule } from '../wizard/wizard.module';
import { DesignsController } from './designs.controller';
import { DesignsService } from './designs.service';

@Module({
  imports: [CmsModule, WizardModule],
  controllers: [DesignsController],
  providers: [DesignsService],
  exports: [DesignsService],
})
export class DesignsModule {}
