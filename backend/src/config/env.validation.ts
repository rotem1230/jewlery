import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

/** Secrets that appear in this repository (examples, scripts, dev fallback) and so are public. */
export const KNOWN_PUBLIC_JWT_SECRETS: ReadonlySet<string> = new Set([
  'change-me-in-production-min-32-chars!!',
  'dev-only-secret-change-in-production-min-32-chars',
  'e2e-test-secret-min-32-characters!!',
]);

export const MIN_JWT_SECRET_LENGTH = 32;
export const MIN_PRODUCTION_BCRYPT_ROUNDS = 10;

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

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
  TRIPO_API_KEY?: string;

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
  if (origins.some((origin) => origin === '*' || /localhost|127\.0\.0\.1|\[::1\]/i.test(origin))) {
    problems.push('CORS_ORIGINS must list explicit https origins (no "*" and no localhost)');
  }

  const publicUrl = String(config.API_PUBLIC_URL ?? '');
  if (!publicUrl.startsWith('https://')) {
    problems.push('API_PUBLIC_URL must be the public https URL of this API (used in e-mailed links)');
  }

  const rounds = config.BCRYPT_ROUNDS === undefined ? 12 : Number(config.BCRYPT_ROUNDS);
  if (!Number.isInteger(rounds) || rounds < MIN_PRODUCTION_BCRYPT_ROUNDS) {
    problems.push(`BCRYPT_ROUNDS must be an integer >= ${MIN_PRODUCTION_BCRYPT_ROUNDS} in production`);
  }

  return problems;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  const problems = errors.map((e) => Object.values(e.constraints ?? {}).join(', '));

  if (config.NODE_ENV === 'production') {
    problems.push(...productionProblems(config));
  }

  if (problems.length > 0) {
    throw new Error(`Environment validation failed:\n${problems.join('\n')}`);
  }
  return config;
}
