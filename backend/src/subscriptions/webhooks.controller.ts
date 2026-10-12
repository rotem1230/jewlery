import { Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { PaymentWebhookService } from './payment-webhook.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: PaymentWebhookService) {}

  @Public()
  @Post('payments')
  @ApiOperation({
    summary: 'Receive a payment provider webhook',
    description:
      'Requires PAYMENT_WEBHOOK_SECRET. The body must be signed: x-webhook-signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">. ' +
      'Idempotent on providerEventId; applies subscription status transitions for known event types.',
  })
  @ApiHeader({ name: 'x-webhook-signature', required: true })
  @ApiResponse({ status: 201, description: 'Event recorded (or already recorded)' })
  @ApiResponse({ status: 401, description: 'Missing, invalid or stale signature' })
  @ApiResponse({ status: 503, description: 'Webhook secret not configured' })
  handlePaymentWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-webhook-signature') signature?: string,
  ) {
    return this.webhooks.handle(req.rawBody, signature);
  }
}
