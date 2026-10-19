import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { CardcomPaymentsService } from './cardcom-payments.service';
import { PaymentWebhookService } from './payment-webhook.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: PaymentWebhookService,
    private readonly cardcom: CardcomPaymentsService,
  ) {}

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

  @Public()
  @Post('cardcom')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive a Cardcom payment page notification (LowProfileResult)',
    description:
      'Cardcom does not sign it: only its LowProfileId is read, and the deal is confirmed with Cardcom (LowProfile/GetLpResult) ' +
      'before anything is applied. Idempotent per payment page.',
  })
  @ApiResponse({ status: 200, description: 'Received (applied, already applied, not paid, or for a page this platform did not open)' })
  @ApiResponse({ status: 400, description: 'No LowProfileId (CARDCOM_NOTIFICATION_INVALID)' })
  @ApiResponse({ status: 503, description: 'Cardcom could not be asked right now (PAYMENT_PROVIDER_UNAVAILABLE): send again' })
  handleCardcomNotification(@Body() body: unknown) {
    return this.cardcom.handleNotification(body);
  }
}
