import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { CreateVisualizationJobDto, QueryVisualizationJobsDto } from './dto/visualization.dto';
import { VisualizationService } from './visualization.service';

type AuthedRequest = Request & { user: User };

/**
 * Conceptually gated by feature flag `phase2_visualization` (see docs/backend-contracts.md).
 * The flag defaults to off and is reserved for rollout control; the `personal_visualization`
 * entitlement enforced in the service is the actual paywall for job creation today.
 */
@ApiTags('Visualization')
@ApiBearerAuth()
@Controller('visualization')
export class VisualizationController {
  constructor(private readonly visualization: VisualizationService) {}

  @Post('jobs')
  @ApiOperation({
    summary: 'Create a personal-photo visualization job',
    description:
      'Requires phase2_visualization and the personal_visualization entitlement. Writes a distinct overlay upload (not the selfie).',
  })
  create(@Body() dto: CreateVisualizationJobDto, @Req() req: AuthedRequest) {
    return this.visualization.create(req.user, dto);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List my visualization jobs' })
  findMany(@Query() query: QueryVisualizationJobsDto, @Req() req: AuthedRequest) {
    return this.visualization.findMany(req.user, query);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get a visualization job by id' })
  findOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.visualization.findOne(id, req.user);
  }
}
