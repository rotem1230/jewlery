import { validateEnv } from './env.validation';

const STRONG_SECRET = 'k3Y-production-secret-with-at-least-32-random-chars';

function productionEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://app:secret@db.internal:5432/malinvosky',
    JWT_SECRET: STRONG_SECRET,
    SMTP_URL: 'smtps://mailer:secret@smtp.example.com:465',
    CORS_ORIGINS: 'https://app.example.com',
    API_PUBLIC_URL: 'https://api.example.com',
    TRUST_PROXY: '1',
    TRIAL_HASH_SECRET: 'trial-bookkeeping-secret-0123456789abcdef',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(() => validateEnv(productionEnv())).not.toThrow();
  });

  it('refuses to boot production without JWT_SECRET', () => {
    expect(() => validateEnv(productionEnv({ JWT_SECRET: undefined }))).toThrow(/JWT_SECRET/);
  });

  it('refuses a short JWT_SECRET in production', () => {
    expect(() => validateEnv(productionEnv({ JWT_SECRET: 'too-short-secret' }))).toThrow(/JWT_SECRET/);
  });

  it.each([
    'change-me-in-production-min-32-chars!!',
    'dev-only-secret-change-in-production-min-32-chars',
    'e2e-test-secret-min-32-characters!!',
  ])('refuses the publicly known secret %s in production', (secret) => {
    expect(() => validateEnv(productionEnv({ JWT_SECRET: secret }))).toThrow(/JWT_SECRET/);
  });

  it('refuses production without SMTP (reset links would only go to logs)', () => {
    expect(() => validateEnv(productionEnv({ SMTP_URL: '' }))).toThrow(/SMTP_URL/);
  });

  it('refuses wildcard or localhost CORS origins in production', () => {
    expect(() => validateEnv(productionEnv({ CORS_ORIGINS: '*' }))).toThrow(/CORS_ORIGINS/);
    expect(() => validateEnv(productionEnv({ CORS_ORIGINS: 'http://localhost:8081' }))).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it('refuses a non-https public API URL in production', () => {
    expect(() => validateEnv(productionEnv({ API_PUBLIC_URL: 'http://api.example.com' }))).toThrow(
      /API_PUBLIC_URL/,
    );
  });

  it('refuses a low bcrypt cost in production', () => {
    expect(() => validateEnv(productionEnv({ BCRYPT_ROUNDS: '4' }))).toThrow(/BCRYPT_ROUNDS/);
  });

  it('requires an explicit proxy-trust decision in production', () => {
    expect(() => validateEnv(productionEnv({ TRUST_PROXY: undefined }))).toThrow(/TRUST_PROXY/);
    expect(() => validateEnv(productionEnv({ TRUST_PROXY: 'false' }))).not.toThrow();
    expect(() => validateEnv(productionEnv({ TRUST_PROXY: '10.0.0.0/8' }))).not.toThrow();
  });

  it("refuses TRUST_PROXY=true in production (clients could choose their own IP)", () => {
    expect(() => validateEnv(productionEnv({ TRUST_PROXY: 'true' }))).toThrow(/TRUST_PROXY/);
  });

  it('refuses plain-http CORS origins in production', () => {
    expect(() => validateEnv(productionEnv({ CORS_ORIGINS: 'http://app.example.com' }))).toThrow(/CORS_ORIGINS/);
  });

  it('refuses the test-suite secret in production', () => {
    expect(() =>
      validateEnv(productionEnv({ JWT_SECRET: 'test-only-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz' })),
    ).toThrow(/JWT_SECRET/);
  });

  it('refuses a bcrypt cost so high that every sign-in becomes a denial of service', () => {
    expect(() => validateEnv(productionEnv({ BCRYPT_ROUNDS: '20' }))).toThrow(/BCRYPT_ROUNDS/);
    expect(() =>
      validateEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://localhost/dev', BCRYPT_ROUNDS: '20' }),
    ).toThrow(/BCRYPT_ROUNDS/);
  });

  it('requires NODE_ENV to be explicit (an unset value silently enabled development behaviour)', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://localhost/dev' })).toThrow(/NODE_ENV/);
    expect(() => validateEnv({ NODE_ENV: 'prod', DATABASE_URL: 'postgresql://localhost/dev' })).toThrow(/NODE_ENV/);
  });

  it('refuses the mock payment provider in production', () => {
    expect(() => validateEnv(productionEnv({ PAYMENTS_PROVIDER: 'mock' }))).toThrow(/PAYMENTS_PROVIDER/);
  });

  it('accepts Cardcom in production with its terminal number and API name, and refuses it without them', () => {
    const cardcom = { PAYMENTS_PROVIDER: 'cardcom', CARDCOM_TERMINAL_NUMBER: '1000', CARDCOM_API_NAME: 'api-name' };
    expect(() => validateEnv(productionEnv(cardcom))).not.toThrow();
    expect(() => validateEnv(productionEnv({ ...cardcom, CARDCOM_TERMINAL_NUMBER: undefined }))).toThrow(/CARDCOM_TERMINAL_NUMBER/);
    expect(() => validateEnv(productionEnv({ ...cardcom, CARDCOM_TERMINAL_NUMBER: 'abc' }))).toThrow(/CARDCOM_TERMINAL_NUMBER/);
    expect(() => validateEnv(productionEnv({ ...cardcom, CARDCOM_API_NAME: '' }))).toThrow(/CARDCOM_API_NAME/);
    expect(() =>
      validateEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://localhost/dev', PAYMENTS_PROVIDER: 'cardcom' }),
    ).toThrow(/CARDCOM_TERMINAL_NUMBER/);
  });

  it('refuses a Cardcom address other than https', () => {
    const cardcom = { PAYMENTS_PROVIDER: 'cardcom', CARDCOM_TERMINAL_NUMBER: '1000', CARDCOM_API_NAME: 'api-name' };
    expect(() => validateEnv(productionEnv({ ...cardcom, CARDCOM_BASE_URL: 'http://secure.cardcom.solutions' }))).toThrow(
      /CARDCOM_BASE_URL/,
    );
  });

  it('refuses short signing secrets for payment webhooks and media URLs', () => {
    expect(() => validateEnv(productionEnv({ PAYMENT_WEBHOOK_SECRET: 'short' }))).toThrow(/PAYMENT_WEBHOOK_SECRET/);
    expect(() => validateEnv(productionEnv({ UPLOAD_URL_SECRET: 'short' }))).toThrow(/UPLOAD_URL_SECRET/);
  });

  it('requires a dedicated trial bookkeeping secret in production (rotating JWT_SECRET must not reset who had a trial)', () => {
    expect(() => validateEnv(productionEnv({ TRIAL_HASH_SECRET: undefined }))).toThrow(/TRIAL_HASH_SECRET/);
    expect(() => validateEnv(productionEnv({ TRIAL_HASH_SECRET: 'short' }))).toThrow(/TRIAL_HASH_SECRET/);
  });

  it('keeps local development friction-free', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://localhost:5433/dev' }),
    ).not.toThrow();
  });

  it('still requires DATABASE_URL everywhere', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });
});

describe('.env.example', () => {
  it('is a valid development configuration', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require('dotenv') as typeof import('dotenv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    const example = parse(readFileSync(`${__dirname}/../../.env.example`, 'utf8'));
    expect(() => validateEnv(example)).not.toThrow();
  });
});
