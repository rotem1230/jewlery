import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../authorization/decorators/public.decorator';
import { WizardEngineService } from './wizard-engine.service';

@ApiTags('Wizard')
@Public()
@Controller('wizard')
export class WizardController {
  constructor(private readonly wizard: WizardEngineService) {}

  @Get('item-types')
  itemTypes() {
    return this.wizard.listItemTypes();
  }

  @Get('config/:itemTypeCode')
  config(@Param('itemTypeCode') itemTypeCode: string) {
    return this.wizard.loadItemTypeByCode(itemTypeCode);
  }

  @Get('size-charts/:itemTypeCode')
  sizeCharts(@Param('itemTypeCode') itemTypeCode: string) {
    return this.wizard.sizeCharts(itemTypeCode);
  }
}
