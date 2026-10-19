import { ConfigService } from '@nestjs/config';

/** What a Cardcom page is for, as named in its return address (checkout, card or jewelry). */
export type CardcomPageKind = 'checkout' | 'card' | 'jewelry';

/**
 * The addresses a Cardcom payment page sends the card holder back to (by result) and notifies, on
 * this API's public address. The return page tells the app the result and which page it was.
 */
export function cardcomUrls(config: ConfigService, kind: CardcomPageKind, id: string) {
  const base = `${config.get<string>('apiPublicUrl')}/${config.get<string>('apiPrefix') ?? 'api/v1'}`;
  const back = (result: string) => `${base}/payments/cardcom/return?${kind}=${id}&result=${result}`;
  return {
    successUrl: back('success'),
    failedUrl: back('failed'),
    cancelUrl: back('cancel'),
    webhookUrl: `${base}/webhooks/cardcom`,
  };
}
