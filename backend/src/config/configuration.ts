export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Jerusalem',
  appUrl: process.env.APP_URL ?? 'http://localhost:8081',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  bodySizeLimit: parseInt(process.env.BODY_SIZE_LIMIT ?? '1048576', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  s3: {
    bucket: process.env.S3_BUCKET ?? 'local-dev',
    endpoint: process.env.S3_ENDPOINT,
  },
  mail: {
    from: process.env.MAIL_FROM ?? 'no-reply@mailnvosky.local',
    smtpUrl: process.env.SMTP_URL,
  },
  tripo: {
    apiKey: process.env.TRIPO_API_KEY,
  },
  render: {
    engineUrl: process.env.RENDER_ENGINE_URL,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
  },
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  logRequests: process.env.LOG_REQUESTS !== 'false',
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  jwt: {
    secret:
      process.env.JWT_SECRET ?? 'dev-only-secret-change-in-production-min-32-chars',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  auth: {
    registrationOpen: process.env.REGISTRATION_OPEN !== 'false',
    loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS ?? '5', 10),
    loginLockMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES ?? '15', 10),
    // Fallbacks used only when the AppConfig `token_ttls` row is absent.
    emailVerifyTtlMinutes: parseInt(process.env.EMAIL_VERIFY_TTL_MINUTES ?? '1440', 10),
    passwordResetTtlMinutes: parseInt(process.env.PASSWORD_RESET_TTL_MINUTES ?? '30', 10),
    // Fallbacks used only when the AppConfig `password_policy` row is absent.
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH ?? '8', 10),
    passwordRequireLetter: process.env.PASSWORD_REQUIRE_LETTER !== 'false',
    passwordRequireNumber: process.env.PASSWORD_REQUIRE_NUMBER !== 'false',
  },
});
