import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin/FeatureFlags')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/feature-flags')
export class AdminFeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @Get()
  list() {
    return this.featureFlags.listAll();
  }

  @Post()
  create(@Body() dto: CreateFeatureFlagDto, @Req() req: AuthedRequest) {
    return this.featureFlags.create(
      dto.key,
      dto.enabled ?? false,
      dto.rolloutPct ?? 100,
      dto.roles,
      req.user.id,
    );
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateFeatureFlagDto,
    @Req() req: AuthedRequest,
  ) {
    return this.featureFlags.update(key, dto, req.user.id);
  }

  @Delete(':key')
  remove(@Param('key') key: string, @Req() req: AuthedRequest) {
    return this.featureFlags.remove(key, req.user.id);
  }
}
