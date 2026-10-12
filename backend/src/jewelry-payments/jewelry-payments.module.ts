import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { JewelryPaymentsController } from './jewelry-payments.controller';
import { JewelryPaymentsService } from './jewelry-payments.service';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [JewelryPaymentsController],
  providers: [JewelryPaymentsService],
  exports: [JewelryPaymentsService],
})
export class JewelryPaymentsModule {}
