# Production readiness — Malinvosky API

This document is the operator's checklist for deploying the hardened backend, and the list of
contract changes the mobile app must follow. The API behaviour described here is covered by the
automated suites in `backend/test` (`npm test` in `backend/`). The Dockerfile is built by CI
(`.github/workflows/ci.yml`); it has not been run in a production-like environment yet.

## 1. Deploy order

1. **Build** the images (from `backend/`):
   - `docker build -t malinvosky-api .` — the API (unprivileged user, health check on `/api/v1/health`).
   - `docker build --target release -t malinvosky-release .` — migrations + reference seed.
2. **Configure** the environment (section 2). The API refuses to boot in production with unsafe values.
3. **Run the release image once**, before starting the new API containers:
   `prisma migrate deploy` then the reference seed. The seed never creates accounts and never
   overrides feature flags, plan prices or app config that already exist. Demo data
   (`SEED_DEMO_DATA=true`) is refused in production.
   - The 2026-10-12 migrations take short table locks while they deduplicate and index existing
     data (`users`, `reviews`, `subscriptions`) and build indexes without `CONCURRENTLY`. Deploy in a
     quiet window; with large tables, schedule a maintenance window.
   - They change data deliberately: duplicate external identities are unlinked (the oldest account
     keeps the Google/Apple identity), an author's older duplicate reviews are removed and ratings
     recomputed, older duplicate live subscriptions are closed, cross-owner media references are
     removed. Take a database backup first.
4. **Start the API** (any number of instances; see section 3 for what needs Redis / sticky sessions).
5. **Re-invite unverified accounts.** Accounts created before e-mail verification was enforced
   cannot sign in until they verify:
   `node dist/cli/resend-verification.js --dry-run` (count), then without `--dry-run`
   (run with the production environment and `JOBS_ENABLED=false`). The per-account mail cap
   applies, so re-running it cannot flood an inbox.
6. **Release the mobile app version** that implements section 5 at the same time; older app
   versions cannot sign up, accept quotes or display private media against this API.

## 2. Required configuration (production)

See `backend/.env.example` for every variable. The boot validation enforces:

| Variable | Rule |
|---|---|
| `NODE_ENV` | `production` (an unset `NODE_ENV` is refused everywhere) |
| `JWT_SECRET` | ≥ 32 random characters, not a published example value |
| `API_PUBLIC_URL` | public `https://` URL of the API (e-mailed links) |
| `CORS_ORIGINS` | explicit `https://` origins; no `*`, no localhost, no default |
| `TRUST_PROXY` | must be set: hop count (e.g. `1`), proxy addresses, or `false`; never `true` |
| `SMTP_URL` | required (verification / reset links are never logged in production) |
| `BCRYPT_ROUNDS` | 10–15 |
| `PAYMENTS_PROVIDER` | must not be `mock` |
| `PAYMENT_WEBHOOK_SECRET`, `UPLOAD_URL_SECRET` | ≥ 32 characters when set |

Recommended: `TRIAL_HASH_SECRET` (else derived from `JWT_SECRET`; rotating that secret would reset
trial history), `UPLOAD_URL_SECRET`, `REDIS_URL`.

## 3. Infrastructure requirements

- **PostgreSQL in UTC.** Prisma stores `DateTime` as UTC wall-clock time. Raw SQL in the code
  binds dates through `sqlTimestamp()` and migrations use `timezone('UTC', now())`; the e2e suite
  runs the database in Asia/Jerusalem to catch regressions.
- **Reverse proxy / TLS.** Terminate TLS in front of the API and set `TRUST_PROXY` to match, so
  per-client rate limits see the real client address.
- **Redis** for more than one API instance: rate limits (login, mail, media, unknown-e-mail
  lockout) and the config cache are per instance without it.
- **WebSockets (`/ws`).** Session revocation (sign out everywhere, password change/reset, account
  deletion) disconnects sockets on the instance that handled the request; there is no Socket.IO
  Redis adapter yet. With several instances use sticky sessions; a revoked user's socket on another
  instance stays connected until its access token expires (15 min by default) — joining rooms
  re-checks the account.
- **Media storage.** Uploads are stored on local disk (`/app/uploads-local`, mount a persistent
  volume). The S3 presign/confirm flow is not implemented and answers 501 in production. Local
  storage limits the API to instances sharing that volume.
- **Background jobs** (`JOBS_ENABLED=true`): outbox delivery, subscription lifecycle, visualization
  retention purge, stale AI jobs. All are safe to run on several instances at once.

## 4. Payments

- No real payment provider is integrated. With `PAYMENTS_PROVIDER` empty (production), paid-plan
  checkout and jewelry payment intents answer **503 PAYMENT_PROVIDER_NOT_CONFIGURED** (fail
  closed). A configured `STRIPE_SECRET_KEY` without an integration also fails closed.
- Paid plans are bought through `POST /subscriptions/checkout` (server-side price) and activated
  only by the provider's signed webhook. Webhook contract (`POST /api/v1/webhooks/payments`):
  - header `x-webhook-signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, 5-minute tolerance;
  - body `{ provider, providerEventId, type, payload, subscriptionId?, checkoutId?, invoiceId?, amount?, currency? }`;
  - `checkout.completed` (checkoutId, exact amount/currency) → subscription;
    `invoice.paid` (subscriptionId, invoiceId, plan price) → one renewal per invoice;
    `invoice.payment_failed`, `subscription.cancelled`; other types are recorded and ignored.
- Every event is stored with an outcome. **Monitor `payment_events.outcome = 'NEEDS_REVIEW'`**
  (also logged as an error): money that could not be applied safely (wrong amount, unknown
  subscription, double payment, payment for a cancelled or replaced subscription).

## 5. Contract changes the mobile app must follow

| Area | Change |
|---|---|
| Sign-up | `POST /auth/register` returns `{ user, requiresEmailVerification: true }` and no tokens; sign-in answers `403 EMAIL_NOT_VERIFIED` until the e-mailed link is opened; offer "resend" (`POST /auth/resend-verify`). |
| Locked accounts | `403 ACCOUNT_LOCKED` after repeated failures (also for unknown e-mails). |
| Refresh | only `401` means "sign out"; 5xx is retryable. |
| Quotes | `POST /quotes/:id/accept` requires `{ expectedTotalPrice, expectedCurrency }` as shown on the card; `409 QUOTE_CHANGED` returns the current terms. Listen to the `quote:updated` socket event. |
| Jewelry payment | `POST /jewelry-payments/intents` takes `{ quoteId }` only (amount comes from the accepted quote). |
| Media | private media is served only with the signed `contentUrl` / `thumbnailUrl` / `outputUrl` returned by the API (or a bearer token); raw upload ids are not enough. |
| Socket | access token in the handshake `auth.token` (never the query string); reconnect after a token refresh. |
| Subscriptions | paid plans without a trial answer `402 PAYMENT_REQUIRED` on subscribe; use checkout. |
| Design requests | `409 ALREADY_REQUESTED`, `409 NO_ELIGIBLE_JEWELERS`, `429 REQUEST_QUOTA_EXCEEDED`. |
| Designs | a completed design cannot be edited, rolled back or republished (`409 DESIGN_COMPLETED`). |
| Public profiles | jeweler phone / e-mail are no longer public (shared in the handoff after acceptance). |

## 6. Operations

- **Health:** `GET /api/v1/health` (database + Redis).
- **Watch:** `payment_events` with `NEEDS_REVIEW`; `outbox_events` with `deadAt` set (notifications
  that failed 10 times); error logs.
- **Feature flags** start disabled (`phase2_*`, `phase3_*`); enable them deliberately. Geo search
  (`phase3_postgis`) only ever reveals the rounded (~1 km) location.
- **Backups:** daily PostgreSQL backups plus the media volume.

## 7. Development and verification

- `npm test` — unit + e2e regression suites on a real PostgreSQL (embedded locally, or
  `TEST_DATABASE_URL`).
- `npm run migrations:check` — fails when migrations and `schema.prisma` disagree
  (`--print-sql` prints the SQL for a new migration).
- `npm run test:e2e:local` — builds the API and drives the main flows against it with the demo seed.

## 8. Known limitations

- No real payment provider, no S3 storage driver, no Socket.IO Redis adapter (see above).
- The unknown-e-mail lockout and other limiters are per instance without Redis.
- The demo seed's accounts use published passwords — never run it outside local development.
