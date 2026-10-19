import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { QueryPlansDto, SubscribeDto } from './dto/subscription.dto';
import { CardcomPaymentsService } from './cardcom-payments.service';
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
    private readonly cardcom: CardcomPaymentsService,
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
      'Creates a checkout session with the plan price fixed by the server. With Cardcom it carries the payment page ' +
      '(paymentUrl) the app opens; the plan starts once Cardcom confirms the payment.',
  })
  startCheckout(@Body() dto: SubscribeDto, @Req() req: AuthedRequest) {
    return this.checkout.start(req.user, dto);
  }

  @Get('checkout/:id')
  @ApiOperation({
    summary: 'Follow my checkout',
    description: 'OPEN, COMPLETED, NEEDS_REVIEW or CANCELLED. An open Cardcom checkout is confirmed with Cardcom first.',
  })
  async checkoutStatus(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const view = await this.checkout.find(req.user, id);
    if (view.status !== 'OPEN' || view.provider !== 'cardcom') {
      return view;
    }
    await this.cardcom.confirmCheckout(id);
    return this.checkout.find(req.user, id);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel my active subscription' })
  cancel(@Req() req: AuthedRequest) {
    return this.subscriptions.cancel(req.user);
  }
}
