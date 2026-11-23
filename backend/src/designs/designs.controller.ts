import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import {
  CreateDesignDto,
  LockDesignDto,
  QueryDesignsDto,
  TransitionDesignDto,
  UnlockDesignDto,
  UpdateDesignDto,
} from './dto/design.dto';
import { DesignsService } from './designs.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Designs')
@ApiBearerAuth()
@Controller('designs')
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Post()
  create(@Body() dto: CreateDesignDto, @Req() req: AuthedRequest) {
    return this.designs.create(req.user.id, dto);
  }

  @Get()
  findMany(@Query() query: QueryDesignsDto, @Req() req: AuthedRequest) {
    return this.designs.findMany(req.user.id, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.designs.findOne(id, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDesignDto, @Req() req: AuthedRequest) {
    return this.designs.update(id, req.user, dto);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.designs.duplicate(id, req.user);
  }

  @Post(':id/transition')
  transition(@Param('id') id: string, @Body() dto: TransitionDesignDto, @Req() req: AuthedRequest) {
    return this.designs.transition(id, req.user, dto.toStatus);
  }

  @Post(':id/lock')
  lock(@Param('id') id: string, @Body() dto: LockDesignDto, @Req() req: AuthedRequest) {
    return this.designs.lock(id, req.user, dto);
  }

  @Post(':id/unlock')
  unlock(@Param('id') id: string, @Body() dto: UnlockDesignDto, @Req() req: AuthedRequest) {
    return this.designs.unlock(id, req.user, dto);
  }

  @Get(':id/versions')
  versions(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.designs.versions(id, req.user);
  }

  @Post(':id/versions/:versionNumber/restore')
  restoreVersion(
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @Req() req: AuthedRequest,
  ) {
    return this.designs.restoreVersion(id, versionNumber, req.user);
  }

  @Post(':id/feasibility')
  requestFeasibility(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.designs.requestFeasibility(id, req.user);
  }
}
