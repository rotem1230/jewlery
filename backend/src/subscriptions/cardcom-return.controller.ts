import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { CardcomPaymentsService } from './cardcom-payments.service';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, text: string): string {
  return (
    '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>תשלום</title></head>' +
    '<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:48px 16px;color:#222">' +
    `<h1 style="font-size:22px">${title}</h1><p style="font-size:16px">${text}</p></body></html>`
  );
}

/**
 * Where Cardcom sends the card holder after the payment page (the app closes its page here). A
 * successful payment is confirmed with Cardcom right away, so the plan starts even when Cardcom's
 * notification is late. Shows a short Hebrew page either way.
 */
@ApiTags('Payments')
@Controller('payments/cardcom')
export class CardcomReturnController {
  constructor(private readonly cardcom: CardcomPaymentsService) {}

  @Public()
  @Get('return')
  @ApiOperation({ summary: 'Return page after the Cardcom payment page (success / failed / cancel)' })
  async back(
    @Query('checkout') checkout: string | undefined,
    @Query('card') card: string | undefined,
    @Query('jewelry') jewelry: string | undefined,
    @Query('result') result: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const succeeded = result === 'success';
    if (succeeded && typeof checkout === 'string' && GUID.test(checkout)) {
      await this.cardcom.confirmCheckout(checkout);
    }
    if (succeeded && typeof card === 'string' && GUID.test(card)) {
      await this.cardcom.confirmCardUpdateQuietly(card);
    }
    if (succeeded && typeof jewelry === 'string' && GUID.test(jewelry)) {
      await this.cardcom.confirmReturn('jewelry', jewelry);
    }
    res
      .status(200)
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(
        succeeded
          ? page('התשלום התקבל', 'תודה! אפשר לחזור לאפליקציה.')
          : page('התשלום לא הושלם', 'לא בוצע חיוב. אפשר לחזור לאפליקציה ולנסות שוב.'),
      );
  }
}
