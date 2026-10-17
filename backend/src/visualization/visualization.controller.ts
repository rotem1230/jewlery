import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { CreateVisualizationJobDto, QueryVisualizationJobsDto } from './dto/visualization.dto';
import { VisualizationService } from './visualization.service';

type AuthedRequest = Request & { user: User };

/**
 * Try-on jobs are gated by feature flag `phase2_visualization` (rollout) and the
 * `personal_visualization` entitlement (paid plans), both enforced in the service.
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
      'Requires phase2_visualization and the personal_visualization entitlement. Composes the design onto the photo at the given placement into a new image (never the selfie itself).',
  })
  create(@Body() dto: CreateVisualizationJobDto, @Req() req: AuthedRequest) {
    return this.visualization.create(req.user, dto);
  }

  @Get('designs/:designId/overlay')
  @ApiOperation({ summary: 'Transparent PNG of my design, to place over a photo before a try-on' })
  async overlay(
    @Param('designId', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) designId: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const png = await this.visualization.overlay(designId, req.user);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(png);
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
