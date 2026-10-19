import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { AdminPlansService } from './admin-plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/admin-plans.dto';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly plans: AdminPlansService) {}

  @Get()
  @ApiOperation({ summary: 'Every plan (offered or not) with its quotas, features and live subscribers' })
  list() {
    return this.plans.list();
  }

  @Get('features')
  @ApiOperation({ summary: 'The features a plan can unlock' })
  features() {
    return this.plans.features();
  }

  @Post()
  @ApiOperation({ summary: 'Create a plan' })
  create(@Body() dto: CreatePlanDto, @Req() req: AuthedRequest) {
    return this.plans.create(req.user, dto);
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Change a plan (a new price applies to new subscribers)' })
  update(@Param('code') code: string, @Body() dto: UpdatePlanDto, @Req() req: AuthedRequest) {
    return this.plans.update(req.user, code, dto);
  }
}
