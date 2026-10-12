import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { CreatePaymentIntentDto } from './dto/jewelry-payment.dto';
import { JewelryPaymentsService } from './jewelry-payments.service';

type AuthedRequest = Request & { user: User };

@ApiTags('JewelryPayments')
@ApiBearerAuth()
@Controller('jewelry-payments')
export class JewelryPaymentsController {
  constructor(private readonly jewelryPayments: JewelryPaymentsService) {}

  @Post('intents')
  @ApiOperation({
    summary: 'Create a jewelry payment intent',
    description: 'Returns 403 FEATURE_DISABLED unless the phase3_jewelry_pay feature flag is enabled.',
  })
  @ApiResponse({ status: 201, description: 'Payment intent persisted' })
  @ApiResponse({ status: 403, description: 'phase3_jewelry_pay is disabled' })
  createIntent(@Body() dto: CreatePaymentIntentDto, @Req() req: AuthedRequest) {
    return this.jewelryPayments.createIntent(req.user, dto);
  }

  @Get('intents/:id')
  @ApiOperation({ summary: 'Get a persisted jewelry payment intent owned by the current user' })
  findOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.jewelryPayments.findOne(id, req.user);
  }
}
