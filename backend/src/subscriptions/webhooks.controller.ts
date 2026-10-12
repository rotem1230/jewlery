import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../authorization/decorators/public.decorator';
import { PaymentWebhookDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Post('payments')
  @ApiOperation({
    summary: 'Receive a payment provider webhook',
    description: 'Idempotent on providerEventId (unique). Applies subscription status transitions for known event types.',
  })
  handlePaymentWebhook(@Body() dto: PaymentWebhookDto) {
    return this.subscriptions.handlePaymentWebhook(dto);
  }
}
