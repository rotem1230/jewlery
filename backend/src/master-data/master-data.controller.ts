import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../authorization/decorators/public.decorator';
import { MasterDataService } from './master-data.service';

@ApiTags('MasterData')
@Public()
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get('item-types')
  itemTypes() {
    return this.masterData.itemTypes();
  }

  @Get('metals')
  metals() {
    return this.masterData.metals();
  }

  @Get('settings')
  settings() {
    return this.masterData.settings();
  }

  @Get('stones')
  stones() {
    return this.masterData.stones();
  }

  @Get('finish-types')
  finishTypes() {
    return this.masterData.finishTypes();
  }

  @Get('elements')
  elements() {
    return this.masterData.elements();
  }

  @Get('regions')
  regions() {
    return this.masterData.regions();
  }

  @Get('size-charts')
  sizeCharts(@Query('itemTypeId') itemTypeId?: string, @Query('standard') standard?: string) {
    return this.masterData.sizeCharts(itemTypeId, standard);
  }

  @Get('measurement-guides/:itemTypeId')
  measurementGuide(@Param('itemTypeId') itemTypeId: string, @Query('locale') locale?: string) {
    return this.masterData.measurementGuide(itemTypeId, locale);
  }
}
