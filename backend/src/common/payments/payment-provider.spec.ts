import { ConfigService } from '@nestjs/config';
import { resolvePaymentProvider } from './payment-provider';

describe('resolvePaymentProvider', () => {
  const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;
  const cardcom = { 'payments.provider': 'cardcom', 'cardcom.terminalNumber': 1000, 'cardcom.apiName': 'api-name' };

  it('plan purchases use Cardcom when it is chosen and configured, also in production', () => {
    expect(resolvePaymentProvider(config({ ...cardcom, nodeEnv: 'production' }), ['mock', 'cardcom'])).toBe('cardcom');
  });

  it('Cardcom chosen without its terminal or API name fails closed', () => {
    expect(() => resolvePaymentProvider(config({ ...cardcom, 'cardcom.apiName': '' }), ['mock', 'cardcom'])).toThrow(
      'In-app payments are not available yet',
    );
  });

  it('a flow that has no Cardcom implementation (jewelry payments) stays closed when Cardcom is chosen', () => {
    expect(() => resolvePaymentProvider(config({ ...cardcom, nodeEnv: 'production' }))).toThrow('In-app payments are not available yet');
    expect(() => resolvePaymentProvider(config({ ...cardcom, nodeEnv: 'development' }))).toThrow('In-app payments are not available yet');
  });

  it('the mock provider only outside production, and only when chosen', () => {
    expect(resolvePaymentProvider(config({ 'payments.provider': 'mock', nodeEnv: 'test' }))).toBe('mock');
    expect(() => resolvePaymentProvider(config({ 'payments.provider': 'mock', nodeEnv: 'production' }))).toThrow();
    expect(() => resolvePaymentProvider(config({ 'payments.provider': '', nodeEnv: 'test' }))).toThrow();
  });
});
