/**
 * Environment for every e2e test file. DATABASE_URL comes from global setup.
 * Only test-friendly knobs are set here; security behaviour under test keeps production defaults
 * unless a test opts into a different value through createTestApp({ env }).
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.REDIS_URL = '';
process.env.THROTTLE_LIMIT = '100000';
// Suites register many accounts from 127.0.0.1; the throttle tests set production-like limits explicitly.
process.env.AUTH_MAIL_THROTTLE_LIMIT = '100000';
process.env.AUTH_LOGIN_THROTTLE_LIMIT = '100000';
process.env.BCRYPT_ROUNDS = '4';
process.env.JOBS_ENABLED = 'false';
// Design pictures render in the background after saves; suites that test them turn this on.
process.env.DESIGN_PREVIEWS = 'off';
process.env.CORS_ORIGINS = 'http://localhost:8081';
process.env.API_PUBLIC_URL = 'http://localhost:3000';
process.env.SMTP_URL = '';
process.env.GOOGLE_CLIENT_ID = '';
process.env.APPLE_CLIENT_ID = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.TRIPO_API_KEY = '';
process.env.PAYMENTS_PROVIDER = 'mock';
