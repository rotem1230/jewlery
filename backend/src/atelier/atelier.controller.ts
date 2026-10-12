import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { AtelierService } from './atelier.service';
import { CreateAtelierRequestDto, GeoSearchDto, QueryAtelierDesignsDto, QueryAtelierJewelersDto } from './dto/atelier.dto';

type AuthedRequest = Request & { user: User };

@ApiTags('Atelier')
@Controller('atelier')
export class AtelierController {
  constructor(private readonly atelier: AtelierService) {}

  @Public()
  @Get('designs')
  designs(@Query() query: QueryAtelierDesignsDto) {
    return this.atelier.designs(query);
  }

  @Public()
  @Get('jewelers')
  jewelers(@Query() query: QueryAtelierJewelersDto) {
    return this.atelier.jewelers(query);
  }

  @Public()
  @Get('banners')
  banners() {
    return this.atelier.banners();
  }

  /** Phase 3 stub behind `phase3_postgis`; returns 403 FEATURE_DISABLED when the flag is off. */
  @Public()
  @Get('geo/search')
  geoSearch(@Query() query: GeoSearchDto) {
    return this.atelier.geoSearch(query);
  }

  @ApiBearerAuth()
  @Post('requests')
  createRequest(@Body() dto: CreateAtelierRequestDto, @Req() req: AuthedRequest) {
    return this.atelier.createRequest(req.user, dto);
  }

  @ApiBearerAuth()
  @Get('requests/:id')
  findRequest(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.atelier.findRequest(id, req.user);
  }
}
