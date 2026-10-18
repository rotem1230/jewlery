import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { AiService } from './ai.service';
import { CreateAiInspirationDto } from './dto/ai.dto';

type AuthedRequest = Request & { user: User };

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('inspiration')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start generating an inspiration picture (asynchronous)',
    description:
      'From the note, and from the design inspiration picture when there is one. Returns the QUEUED job; poll GET /ai/jobs/:id until SUCCEEDED (outputUrl: the picture) or FAILED.',
  })
  @ApiResponse({ status: 202, description: 'Job queued' })
  @ApiResponse({ status: 409, description: 'AI_JOB_IN_PROGRESS: one generation at a time per user' })
  @ApiResponse({ status: 429, description: 'AI_QUOTA_EXCEEDED: daily per-user limit reached' })
  createInspiration(@Body() dto: CreateAiInspirationDto, @Req() req: AuthedRequest) {
    return this.ai.createInspiration(req.user, dto);
  }

  @Get('jobs/:id')
  findOne(@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string, @Req() req: AuthedRequest) {
    return this.ai.findOne(id, req.user);
  }
}
