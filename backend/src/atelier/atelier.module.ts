import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AtelierController } from './atelier.controller';
import { AtelierService } from './atelier.service';

@Module({
  imports: [CmsModule, FeatureFlagsModule, PromotionsModule],
  controllers: [AtelierController],
  providers: [AtelierService],
  exports: [AtelierService],
})
export class AtelierModule {}
