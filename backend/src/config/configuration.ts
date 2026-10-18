const MINUTE_MS = 60_000;

/** Only for local development; validateEnv refuses it (and any short secret) in production. */
export const DEV_JWT_SECRET = 'dev-only-secret-change-in-production-min-32-chars';

export const JWT_ISSUER = 'malinvosky-api';
export const JWT_AUDIENCE = 'malinvosky-app';

function int(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Local web clients; production lists its origins explicitly (no default). */
const DEVELOPMENT_CORS_ORIGINS = 'http://localhost:3000,http://localhost:8081';

/**
 * Where uploaded and generated files are kept (STORAGE_DRIVER):
 *  - database: in the `upload_blobs` table, so they survive deploys and restarts of hosts without
 *    a persistent disk (the production default);
 *  - local: in `uploads-local/` on this machine's disk (the default everywhere else).
 * Existing files are always read from the store they were written to, whatever the driver.
 */
export const STORAGE_DRIVERS = ['database', 'local'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export const configuration = () => {
  const port = int(process.env.PORT, 3000);
  const production = process.env.NODE_ENV === 'production';
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    timezone: process.env.APP_TIMEZONE ?? 'Asia/Jerusalem',
    /** Public base URL of this API; e-mailed links point at pages it hosts. */
    apiPublicUrl: (process.env.API_PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    corsOrigins: list(process.env.CORS_ORIGINS ?? (production ? '' : DEVELOPMENT_CORS_ORIGINS)),
    /** Express `trust proxy` (e.g. "1" behind one load balancer); unset = do not trust headers. */
    trustProxy: process.env.TRUST_PROXY ?? '',
    bodySizeLimit: int(process.env.BODY_SIZE_LIMIT, 1_048_576),
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    s3: {
      bucket: process.env.S3_BUCKET ?? 'local-dev',
      endpoint: process.env.S3_ENDPOINT,
    },
    storage: {
      /** See STORAGE_DRIVERS; unset or empty = database in production, local otherwise. */
      driver: process.env.STORAGE_DRIVER || (production ? 'database' : 'local'),
    },
    mail: {
      from: process.env.MAIL_FROM ?? 'no-reply@mailnvosky.local',
      smtpUrl: process.env.SMTP_URL,
    },
    gemini: {
      /** Google Gemini API key: AI inspiration pictures. Unset: AI inspiration answers 503. */
      apiKey: process.env.GEMINI_API_KEY,
      /** Image model; empty = gemini-3.1-flash-image. */
      imageModel: process.env.GEMINI_IMAGE_MODEL,
    },
    visualization: {
      /** Try-on jobs one user may start per 24 hours (each one stores a generated image). */
      jobsPerDay: int(process.env.VISUALIZATION_JOBS_PER_DAY, 20),
    },
    render: {
      engineUrl: process.env.RENDER_ENGINE_URL,
    },
    google: {
      /** Comma-separated OAuth client ids (web/iOS/Android) accepted as ID-token audiences. */
      clientIds: list(process.env.GOOGLE_CLIENT_ID),
    },
    apple: {
      /** Comma-separated bundle / service ids accepted as ID-token audiences. */
      clientIds: list(process.env.APPLE_CLIENT_ID),
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
    },
    subscriptions: {
      /**
       * Key for trial bookkeeping hashes (required in production; outside it, derived from
       * JWT_SECRET when not set). Changing it forgets which mailboxes already had a trial.
       */
      trialHashSecret: process.env.TRIAL_HASH_SECRET ?? '',
    },
    atelier: {
      /** Design requests one designer may send per 24 hours (each one costs jewelers a lead). */
      requestsPerDay: int(process.env.DESIGN_REQUESTS_PER_DAY, 20),
      /** Jewelers one broadcast request reaches. */
      broadcastFanout: int(process.env.ATELIER_BROADCAST_FANOUT, 50),
    },
    leads: {
      /** Overage charges per subscription within one billing cycle (rolling) before delivery stops. */
      overageCapPerPeriod: int(process.env.LEAD_OVERAGE_CAP, 50),
    },
    payments: {
      /** "mock" enables the fake provider (never in production); unset = payments fail closed. */
      provider: process.env.PAYMENTS_PROVIDER ?? '',
      /** HMAC secret shared with the payment provider for webhook signatures. */
      webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
      webhookToleranceSeconds: int(process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS, 300),
    },
    uploads: {
      /** Key for signed media URLs; derived from JWT_SECRET when not set. */
      urlSecret: process.env.UPLOAD_URL_SECRET ?? '',
      signedUrlTtlSeconds: int(process.env.UPLOAD_SIGNED_URL_TTL_SECONDS, 15 * 60),
    },
    jobs: {
      enabled: process.env.JOBS_ENABLED !== 'false',
    },
    logLevel: process.env.LOG_LEVEL ?? 'debug',
    logRequests: process.env.LOG_REQUESTS !== 'false',
    throttle: {
      ttlMs: int(process.env.THROTTLE_TTL_MS, 60_000),
      limit: int(process.env.THROTTLE_LIMIT, 100),
      /** Media downloads per client and window; separate so a chat full of images stays usable. */
      mediaLimit: int(process.env.MEDIA_THROTTLE_LIMIT, 600),
    },
    jwt: {
      secret: process.env.JWT_SECRET || DEV_JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
    auth: {
      registrationOpen: process.env.REGISTRATION_OPEN !== 'false',
      bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
      loginMaxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 10),
      loginLockMinutes: int(process.env.LOGIN_LOCK_MINUTES, 15),
      /** Per (client IP, e-mail) login budget. */
      loginThrottleLimit: int(process.env.AUTH_LOGIN_THROTTLE_LIMIT, 5),
      loginThrottleWindowMs: int(process.env.AUTH_LOGIN_THROTTLE_WINDOW_MS, 15 * MINUTE_MS),
      /** Per client IP budget for endpoints that send mail (register / forgot / resend). */
      mailThrottleLimit: int(process.env.AUTH_MAIL_THROTTLE_LIMIT, 10),
      mailThrottleWindowMs: int(process.env.AUTH_MAIL_THROTTLE_WINDOW_MS, 60 * MINUTE_MS),
      /** Max verification / reset mails per account per hour. */
      mailsPerAccountPerHour: int(process.env.AUTH_MAILS_PER_ACCOUNT_PER_HOUR, 3),
      // Fallbacks used only when the AppConfig `token_ttls` row is absent.
      emailVerifyTtlMinutes: int(process.env.EMAIL_VERIFY_TTL_MINUTES, 1440),
      passwordResetTtlMinutes: int(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
      // Fallbacks used only when the AppConfig `password_policy` row is absent.
      passwordMinLength: int(process.env.PASSWORD_MIN_LENGTH, 8),
      passwordRequireLetter: process.env.PASSWORD_REQUIRE_LETTER !== 'false',
      passwordRequireNumber: process.env.PASSWORD_REQUIRE_NUMBER !== 'false',
    },
  };
};
