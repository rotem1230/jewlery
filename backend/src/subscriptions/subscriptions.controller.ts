import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { QueryPlansDto, SubscribeDto } from './dto/subscription.dto';
import { CheckoutService } from './checkout.service';
import { SubscriptionsService } from './subscriptions.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly checkout: CheckoutService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'List active plans, optionally filtered by role' })
  plans(@Query() query: QueryPlansDto) {
    return this.subscriptions.listPlans(query.role);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my current active/trialing/past-due subscription' })
  me(@Req() req: AuthedRequest) {
    return this.subscriptions.me(req.user.id);
  }

  @Get('entitlements/me')
  @ApiOperation({ summary: 'List my active entitlement keys' })
  entitlementsMe(@Req() req: AuthedRequest) {
    return this.subscriptions.entitlementsMe(req.user.id);
  }

  @Post('subscribe')
  @ApiOperation({
    summary: 'Subscribe to a plan',
    description: 'Creates a TRIALING or ACTIVE subscription based on the plan trialDays and allocates Lead rows for the period when leadQuota > 0.',
  })
  subscribe(@Body() dto: SubscribeDto, @Req() req: AuthedRequest) {
    return this.subscriptions.subscribe(req.user, dto);
  }

  @Post('checkout')
  @ApiOperation({
    summary: 'Start buying a paid plan',
    description:
      'Creates (or returns the open) checkout session with the plan price fixed by the server. The payment provider confirms it with a signed checkout.completed webhook.',
  })
  startCheckout(@Body() dto: SubscribeDto, @Req() req: AuthedRequest) {
    return this.checkout.start(req.user, dto);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel my active subscription' })
  cancel(@Req() req: AuthedRequest) {
    return this.subscriptions.cancel(req.user);
  }
}
