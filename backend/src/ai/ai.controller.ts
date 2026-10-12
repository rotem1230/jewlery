import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  createInspiration(@Body() dto: CreateAiInspirationDto, @Req() req: AuthedRequest) {
    return this.ai.createInspiration(req.user, dto);
  }

  @Get('jobs/:id')
  findOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.ai.findOne(id, req.user);
  }
}
