import { Module } from '@nestjs/common';
import { WizardController } from './wizard.controller';
import { WizardEngineService } from './wizard-engine.service';

@Module({
  controllers: [WizardController],
  providers: [WizardEngineService],
  exports: [WizardEngineService],
})
export class WizardModule {}
