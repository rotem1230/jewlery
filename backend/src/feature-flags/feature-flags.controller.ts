import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { FeatureFlagsService } from './feature-flags.service';

type AuthedRequest = Request & { user: User };

@ApiTags('FeatureFlags')
@ApiBearerAuth()
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @Get()
  getFlags(@Req() req: AuthedRequest) {
    return this.featureFlags.evaluateAll(req.user);
  }
}
