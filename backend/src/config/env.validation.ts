import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';
import { STORAGE_DRIVERS } from './configuration';

/** Secrets that appear in this repository (examples, scripts, dev fallback) and so are public. */
export const KNOWN_PUBLIC_JWT_SECRETS: ReadonlySet<string> = new Set([
  'change-me-in-production-min-32-chars!!',
  'dev-only-secret-change-in-production-min-32-chars',
  'e2e-test-secret-min-32-characters!!',
  'test-only-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
]);

export const MIN_JWT_SECRET_LENGTH = 32;
export const MIN_PRODUCTION_BCRYPT_ROUNDS = 10;
/** Each extra round doubles the cost; beyond this every sign-in becomes a denial of service. */
export const MAX_BCRYPT_ROUNDS = 15;
export const MIN_SIGNING_SECRET_LENGTH = 32;
const NODE_ENVS = ['development', 'test', 'production'];
const PAYMENT_PROVIDERS = ['mock', 'cardcom'];

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsIn(NODE_ENVS, { message: `NODE_ENV must be one of ${NODE_ENVS.join(', ')}` })
  NODE_ENV!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  MAIL_FROM?: string;

  @IsOptional()
  @IsString()
  SMTP_URL?: string;

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_IMAGE_MODEL?: string;

  @IsOptional()
  @IsString()
  RENDER_ENGINE_URL?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;
}

function productionProblems(config: Record<string, unknown>): string[] {
  const problems: string[] = [];

  const secret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';
  if (secret.length < MIN_JWT_SECRET_LENGTH || KNOWN_PUBLIC_JWT_SECRETS.has(secret)) {
    problems.push(
      `JWT_SECRET must be a private random value of at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  }

  if (!config.SMTP_URL) {
    problems.push('SMTP_URL is required in production (verification and reset links are e-mailed, never logged)');
  }

  const origins = String(config.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    origins.some(
      (origin) => !origin.startsWith('https://') || /localhost|127\.0\.0\.1|\[::1\]/i.test(origin),
    )
  ) {
    problems.push('CORS_ORIGINS must list explicit https origins (no "*", no plain http and no localhost)');
  }

  const publicUrl = String(config.API_PUBLIC_URL ?? '');
  if (!publicUrl.startsWith('https://')) {
    problems.push('API_PUBLIC_URL must be the public https URL of this API (used in e-mailed links)');
  }

  const trustProxy = String(config.TRUST_PROXY ?? '').trim().toLowerCase();
  if (trustProxy === '' || trustProxy === 'true') {
    problems.push(
      'TRUST_PROXY must be set in production: the number of proxies in front of the API (e.g. 1), their addresses, ' +
        'or false when it is exposed directly ("true" would let clients choose their own IP)',
    );
  }

  const rounds = config.BCRYPT_ROUNDS === undefined ? 12 : Number(config.BCRYPT_ROUNDS);
  if (!Number.isInteger(rounds) || rounds < MIN_PRODUCTION_BCRYPT_ROUNDS) {
    problems.push(`BCRYPT_ROUNDS must be an integer >= ${MIN_PRODUCTION_BCRYPT_ROUNDS} in production`);
  }

  if (config.PAYMENTS_PROVIDER === 'mock') {
    problems.push('PAYMENTS_PROVIDER=mock hands out fake payment secrets and is refused in production');
  }
  // Trial bookkeeping must outlive JWT_SECRET rotations: hashed with the JWT secret, rotating it
  // would forget every trial already used. Changing this secret has the same effect (see docs).
  const trialSecret = typeof config.TRIAL_HASH_SECRET === 'string' ? config.TRIAL_HASH_SECRET : '';
  if (trialSecret.length < MIN_SIGNING_SECRET_LENGTH) {
    problems.push(`TRIAL_HASH_SECRET must be set to at least ${MIN_SIGNING_SECRET_LENGTH} random characters in production`);
  }
  for (const key of ['PAYMENT_WEBHOOK_SECRET', 'UPLOAD_URL_SECRET']) {
    const value = typeof config[key] === 'string' ? (config[key] as string) : '';
    if (value && value.length < MIN_SIGNING_SECRET_LENGTH) {
      problems.push(`${key} must be at least ${MIN_SIGNING_SECRET_LENGTH} random characters`);
    }
  }

  return problems;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  const problems = errors.map((e) => Object.values(e.constraints ?? {}).join(', '));

  if (config.BCRYPT_ROUNDS !== undefined && Number(config.BCRYPT_ROUNDS) > MAX_BCRYPT_ROUNDS) {
    problems.push(`BCRYPT_ROUNDS must be at most ${MAX_BCRYPT_ROUNDS}`);
  }
  if (config.PAYMENTS_PROVIDER && !PAYMENT_PROVIDERS.includes(String(config.PAYMENTS_PROVIDER))) {
    problems.push(`PAYMENTS_PROVIDER must be unset or one of: ${PAYMENT_PROVIDERS.join(', ')}`);
  }
  if (config.PAYMENTS_PROVIDER === 'cardcom') {
    if (!/^[1-9]\d*$/.test(String(config.CARDCOM_TERMINAL_NUMBER ?? '').trim())) {
      problems.push('CARDCOM_TERMINAL_NUMBER must be the Cardcom terminal number when PAYMENTS_PROVIDER=cardcom');
    }
    if (!String(config.CARDCOM_API_NAME ?? '').trim()) {
      problems.push('CARDCOM_API_NAME must be set when PAYMENTS_PROVIDER=cardcom');
    }
  }
  if (config.CARDCOM_BASE_URL && !String(config.CARDCOM_BASE_URL).startsWith('https://')) {
    problems.push('CARDCOM_BASE_URL must be an https address (the API credentials travel to it)');
  }
  // Unset or empty = the default for NODE_ENV (database in production, local otherwise).
  if (config.STORAGE_DRIVER && !(STORAGE_DRIVERS as readonly string[]).includes(String(config.STORAGE_DRIVER))) {
    problems.push(`STORAGE_DRIVER must be unset or one of: ${STORAGE_DRIVERS.join(', ')}`);
  }

  if (config.NODE_ENV === 'production') {
    problems.push(...productionProblems(config));
  }

  if (problems.length > 0) {
    throw new Error(`Environment validation failed:\n${problems.join('\n')}`);
  }
  return config;
}
