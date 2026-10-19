import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AddLeadsDto, AdminCancelSubscriptionDto, AdminSubscriptionsQueryDto, ExtendSubscriptionDto } from './dto/admin-subscriptions.dto';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: AdminSubscriptionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Plans with their validity and, for jewelers, the leads used and left this period',
    description: 'Live plans (trialing, active, past due) by default, the soonest to end first; status=all for every plan.',
  })
  list(@Query() query: AdminSubscriptionsQueryDto) {
    return this.subscriptions.list(query);
  }

  @Post(':id/extend')
  @ApiOperation({ summary: 'Add days to the current period (and to a trial); this period\'s leads move with it' })
  extend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendSubscriptionDto, @Req() req: AuthedRequest) {
    return this.subscriptions.extend(req.user, id, dto);
  }

  @Post(':id/leads')
  @ApiOperation({ summary: 'Add leads to a jeweler\'s plan for the rest of the current period' })
  addLeads(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddLeadsDto, @Req() req: AuthedRequest) {
    return this.subscriptions.addLeads(req.user, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'End a plan at the end of its period, or at once (refunds are separate)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminCancelSubscriptionDto, @Req() req: AuthedRequest) {
    return this.subscriptions.cancel(req.user, id, dto);
  }
}
