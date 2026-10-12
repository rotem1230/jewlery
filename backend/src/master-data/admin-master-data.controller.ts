import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import {
  CreateElementDto,
  CreateFinishTypeDto,
  CreateItemTypeDto,
  CreateMeasurementGuideDto,
  CreateMetalDto,
  CreateMetalPurityDto,
  CreateRegionDto,
  CreateSettingDto,
  CreateSizeChartDto,
  CreateStoneDto,
  CreateStoneOptionDto,
  EtlImportDto,
  UpdateElementDto,
  UpdateFinishTypeDto,
  UpdateItemTypeDto,
  UpdateMeasurementGuideDto,
  UpdateMetalDto,
  UpdateMetalPurityDto,
  UpdateRegionDto,
  UpdateSettingDto,
  UpdateSizeChartDto,
  UpdateStoneDto,
  UpdateStoneOptionDto,
} from './dto/master-data.dto';
import { MasterDataService } from './master-data.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin/MasterData')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/master-data')
export class AdminMasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  // ItemTypes
  @Get('item-types')
  listItemTypes() {
    return this.masterData.adminListItemTypes();
  }

  @Post('item-types')
  createItemType(@Body() dto: CreateItemTypeDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateItemType(dto, req.user.id);
  }

  @Patch('item-types/:id')
  updateItemType(@Param('id') id: string, @Body() dto: UpdateItemTypeDto, @Req() req: AuthedRequest) {
    return this.masterData.adminUpdateItemType(id, dto, req.user.id);
  }

  // Metals
  @Get('metals')
  listMetals() {
    return this.masterData.adminListMetals();
  }

  @Post('metals')
  createMetal(@Body() dto: CreateMetalDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateMetal(dto, req.user.id);
  }

  @Patch('metals/:id')
  updateMetal(@Param('id') id: string, @Body() dto: UpdateMetalDto, @Req() req: AuthedRequest) {
    return this.masterData.adminUpdateMetal(id, dto, req.user.id);
  }

  @Post('metals/:metalId/purities')
  createMetalPurity(
    @Param('metalId') metalId: string,
    @Body() dto: CreateMetalPurityDto,
    @Req() req: AuthedRequest,
  ) {
    return this.masterData.adminCreateMetalPurity(metalId, dto, req.user.id);
  }

  @Patch('metal-purities/:id')
  updateMetalPurity(
    @Param('id') id: string,
    @Body() dto: UpdateMetalPurityDto,
    @Req() req: AuthedRequest,
  ) {
    return this.masterData.adminUpdateMetalPurity(id, dto, req.user.id);
  }

  // Settings
  @Get('settings')
  listSettings() {
    return this.masterData.adminListSettings();
  }

  @Post('settings')
  createSetting(@Body() dto: CreateSettingDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateSetting(dto, req.user.id);
  }

  @Patch('settings/:id')
  updateSetting(@Param('id') id: string, @Body() dto: UpdateSettingDto, @Req() req: AuthedRequest) {
    return this.masterData.adminUpdateSetting(id, dto, req.user.id);
  }

  // Stones
  @Get('stones')
  listStones() {
    return this.masterData.adminListStones();
  }

  @Post('stones')
  createStone(@Body() dto: CreateStoneDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateStone(dto, req.user.id);
  }

  @Patch('stones/:id')
  updateStone(@Param('id') id: string, @Body() dto: UpdateStoneDto, @Req() req: AuthedRequest) {
    return this.masterData.adminUpdateStone(id, dto, req.user.id);
  }

  @Post('stones/:stoneId/options')
  createStoneOption(
    @Param('stoneId') stoneId: string,
    @Body() dto: CreateStoneOptionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.masterData.adminCreateStoneOption(stoneId, dto, req.user.id);
  }

  @Patch('stone-options/:id')
  updateStoneOption(
    @Param('id') id: string,
    @Body() dto: UpdateStoneOptionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.masterData.adminUpdateStoneOption(id, dto, req.user.id);
  }

  // FinishTypes
  @Get('finish-types')
  listFinishTypes() {
    return this.masterData.adminListFinishTypes();
  }

  @Post('finish-types')
  createFinishType(@Body() dto: CreateFinishTypeDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateFinishType(dto, req.user.id);
  }

  @Patch('finish-types/:id')
  updateFinishType(
    @Param('id') id: string,
    @Body() dto: UpdateFinishTypeDto,
    @Req() req: AuthedRequest,
  ) {
    return this.masterData.adminUpdateFinishType(id, dto, req.user.id);
  }

  // Elements
  @Get('elements')
  listElements() {
    return this.masterData.adminListElements();
  }

  @Post('elements')
  createElement(@Body() dto: CreateElementDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateElement(dto, req.user.id);
  }

  @Patch('elements/:id')
  updateElement(@Param('id') id: string, @Body() dto: UpdateElementDto, @Req() req: AuthedRequest) {
    return this.masterData.adminUpdateElement(id, dto, req.user.id);
  }

  // Regions
  @Get('regions')
  listRegions() {
    return this.masterData.adminListRegions();
  }

  @Post('regions')
  createRegion(@Body() dto: CreateRegionDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateRegion(dto, req.user.id);
  }

  @Patch('regions/:id')
  updateRegion(@Param('id') id: string, @Body() dto: UpdateRegionDto, @Req() req: AuthedRequest) {
    return this.masterData.adminUpdateRegion(id, dto, req.user.id);
  }

  // SizeCharts
  @Get('size-charts')
  listSizeCharts(@Query('itemTypeId') itemTypeId?: string) {
    return this.masterData.adminListSizeCharts(itemTypeId);
  }

  @Post('size-charts')
  createSizeChart(@Body() dto: CreateSizeChartDto, @Req() req: AuthedRequest) {
    return this.masterData.adminCreateSizeChart(dto, req.user.id);
  }

  @Patch('size-charts/:id')
  updateSizeChart(
    @Param('id') id: string,
    @Body() dto: UpdateSizeChartDto,
    @Req() req: AuthedRequest,
  ) {
    return this.masterData.adminUpdateSizeChart(id, dto, req.user.id);
  }

  // MeasurementGuides
  @Get('measurement-guides')
  listMeasurementGuides(@Query('itemTypeId') itemTypeId?: string) {
    return this.masterData.adminListMeasurementGuides(itemTypeId);
  }

  @Post('measurement-guides')
  upsertMeasurementGuide(@Body() dto: CreateMeasurementGuideDto, @Req() req: AuthedRequest) {
    return this.masterData.adminUpsertMeasurementGuide(dto, req.user.id);
  }

  @Patch('measurement-guides/:id')
  updateMeasurementGuide(
    @Param('id') id: string,
    @Body() dto: UpdateMeasurementGuideDto,
    @Req() req: AuthedRequest,
  ) {
    return this.masterData.adminUpdateMeasurementGuide(id, dto, req.user.id);
  }

  // ETL
  @Post('etl/import')
  etlImport(@Body() dto: EtlImportDto, @Req() req: AuthedRequest) {
    return this.masterData.etlImport(dto.entity, dto.rows, req.user.id);
  }
}
