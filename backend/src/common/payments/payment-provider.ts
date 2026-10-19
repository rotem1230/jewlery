import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaymentProvider = 'mock' | 'cardcom';

export function paymentProviderNotConfigured(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    success: false,
    message: 'In-app payments are not available yet',
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  });
}

/**
 * The payment provider for a money-taking flow, among those it implements (`supported`). Fails
 * closed: Cardcom only when chosen and configured (terminal number and API name), the mock
 * provider only when chosen explicitly and never in production, and a provider the flow has no
 * integration for refuses rather than handing out fake payment secrets.
 */
export function resolvePaymentProvider(
  config: ConfigService,
  supported: readonly PaymentProvider[] = ['mock'],
): PaymentProvider {
  const chosen = config.get<string>('payments.provider');
  if (chosen === 'cardcom' && supported.includes('cardcom')) {
    const terminal = config.get<number>('cardcom.terminalNumber');
    if (typeof terminal === 'number' && terminal > 0 && config.get<string>('cardcom.apiName')) {
      return 'cardcom';
    }
    throw paymentProviderNotConfigured();
  }
  if (config.get<string>('stripe.secretKey')) {
    throw paymentProviderNotConfigured();
  }
  if (chosen !== 'mock' || !supported.includes('mock') || config.get<string>('nodeEnv') === 'production') {
    throw paymentProviderNotConfigured();
  }
  return 'mock';
}
