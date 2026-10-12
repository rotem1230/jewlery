import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaymentProvider = 'mock';

export function paymentProviderNotConfigured(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    success: false,
    message: 'In-app payments are not available yet',
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  });
}

/**
 * The payment provider for money-taking flows. Fails closed: the mock provider must be chosen
 * explicitly (PAYMENTS_PROVIDER=mock) and never runs in production, and a configured real
 * provider key without an integration refuses rather than handing out fake payment secrets.
 */
export function resolvePaymentProvider(config: ConfigService): PaymentProvider {
  if (config.get<string>('stripe.secretKey')) {
    throw paymentProviderNotConfigured();
  }
  if (config.get<string>('payments.provider') !== 'mock' || config.get<string>('nodeEnv') === 'production') {
    throw paymentProviderNotConfigured();
  }
  return 'mock';
}
