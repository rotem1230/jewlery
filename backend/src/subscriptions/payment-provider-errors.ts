import { ServiceUnavailableException } from '@nestjs/common';

/** The payment provider could not be reached (or refused for a configuration reason): try again later. */
export function paymentProviderUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    success: false,
    message: 'The payment provider cannot be reached right now; try again in a moment',
    code: 'PAYMENT_PROVIDER_UNAVAILABLE',
  });
}
