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

  it('keeps local development friction-free', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://localhost:5433/dev' }),
    ).not.toThrow();
  });

  it('still requires DATABASE_URL everywhere', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });
});
