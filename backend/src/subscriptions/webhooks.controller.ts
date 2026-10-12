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
  @ApiResponse({ status: 201, description: 'Event recorded (or already recorded), with its outcome; a signed event that could not be applied is recorded as NEEDS_REVIEW' })
  @ApiResponse({ status: 401, description: 'Missing, invalid or stale signature' })
  @ApiResponse({ status: 503, description: 'Webhook secret not configured (WEBHOOK_NOT_CONFIGURED), or a transient failure: retry (WEBHOOK_RETRY)' })
  handlePaymentWebhook(@Req() req: Request, @Headers('x-webhook-signature') signature?: string) {
    // The raw-body parser registered for this route in configureApp leaves the bytes in req.body.
    return this.webhooks.handle(Buffer.isBuffer(req.body) ? req.body : undefined, signature);
  }
}
