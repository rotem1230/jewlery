import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { CreateRenderJobDto } from './dto/render-job.dto';
import { RenderJobsService } from './render-jobs.service';

type AuthedRequest = Request & { user: User };

@ApiTags('RenderJobs')
@ApiBearerAuth()
@Controller('render-jobs')
export class RenderJobsController {
  constructor(private readonly renderJobs: RenderJobsService) {}

  @Post()
  create(@Body() dto: CreateRenderJobDto, @Req() req: AuthedRequest) {
    return this.renderJobs.create(req.user, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.renderJobs.findOne(id, req.user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.renderJobs.cancel(id, req.user);
  }
}
