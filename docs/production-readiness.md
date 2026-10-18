# Production readiness — Malinvosky API and app

This document is the operator's checklist for deploying the hardened backend, and the list of
contract changes the mobile app must follow. The API behaviour described here is covered by the
automated suites in `backend/test` (`npm test` in `backend/`), which CI runs on every pull
request and every push to `main` (`.github/workflows/ci.yml`, section 7). The container images are built by CI; they have not been
run in a production-like environment yet.

## 1. Deploy order

1. **Build** the images (from `backend/`):
   - `docker build -t malinvosky-api .` — the API (unprivileged user, health check on `/api/v1/health`).
   - `docker build --target release -t malinvosky-release .` — migrations + reference seed.
2. **Configure** the environment (section 2). The API refuses to boot in production with unsafe values.
3. **Back up the database**, then **stop the old API instances**. This release adds required
   columns (`subscriptions.price` / `currency`) that older code does not write, and changes API
   contracts (section 5): it is a stop-and-start release, not a rolling one.
4. **Run the release image once**: `prisma migrate deploy`, then the reference seed. The seed never
   creates accounts and never overrides feature flags, plan prices or app config that already
   exist. Demo data (`SEED_DEMO_DATA=true`) is refused in production.
   - Every migration of this release sets a lock timeout (10 s) for its own transaction: if a
     long-running transaction holds a table it needs, the deploy fails fast instead of stalling the
     database. Nothing of the failed migration is applied (each migration runs as one
     transaction). Mark it rolled back and deploy again, **from the release image** (it carries the
     project's Prisma CLI; `npx` elsewhere may fetch another version):
     `node node_modules/prisma/build/index.js migrate resolve --rolled-back <migration_name>`, then
     run the release image again.
   - The migrations change data deliberately (take the backup first):
     - duplicate external identities are unlinked (the oldest account keeps the Google/Apple identity);
     - an author's older duplicate reviews are removed and ratings recomputed;
     - cross-owner media references are removed;
     - users with several live subscriptions keep one (a paid plan in good standing, else a paid
       one past due, else the newest); the others are cancelled and logged in `event_logs`
       (`subscription.superseded_by_migration`, with the kept subscription) so a double charge can
       be refunded;
     - payment events recorded before outcomes existed are marked `LEGACY`;
     - every existing subscription gets its plan's **current** catalog price as its agreed price.
5. **Start the API** (any number of instances; see section 3 for Redis and WebSockets).
6. **Re-invite unverified accounts.** Accounts created before e-mail verification was enforced
   cannot sign in until they verify: `node dist/cli/resend-verification.js --dry-run` (count), then
   without `--dry-run` (production environment, `JOBS_ENABLED=false`). The per-account mail cap
   applies, so re-running it cannot flood an inbox. It handles at most `--limit` accounts per run
   (default 1000, oldest first; the dry-run count is capped the same way), and a re-run starts
   again from the oldest: with more pending accounts, count them in the database
   (`SELECT count(*) FROM users WHERE status = 'PENDING_VERIFICATION' AND "deletedAt" IS NULL`)
   and run once with a `--limit` above that count.
7. **Release the mobile app version** that implements section 5 at the same time; older app
   versions cannot sign up, accept quotes or display private media against this API. There is no
   minimum-version gate yet: ship this release as a forced store update.

## 2. Configuration (production)

See `backend/.env.example` for every variable. The boot validation enforces:

| Variable | Rule |
|---|---|
| `NODE_ENV` | `production` (an unset `NODE_ENV` is refused everywhere) |
| `JWT_SECRET` | ≥ 32 random characters, not a published example value |
| `TRIAL_HASH_SECRET` | ≥ 32 random characters, **required**. Keyed hashes of mailboxes that already had a trial; changing it forgets that history (everyone could take a trial again) |
| `API_PUBLIC_URL` | public `https://` URL of the API (e-mailed links) |
| `CORS_ORIGINS` | explicit `https://` origins; no `*`, no localhost, no default |
| `TRUST_PROXY` | must be set: hop count (e.g. `1`), proxy addresses, or `false`; never `true` |
| `SMTP_URL` | required (verification / reset links are never logged in production), e.g. `smtps://user:password@smtp.example.com:465`; percent-encode reserved characters (`@ : / ? # %`) in the user name and password — the URL is parsed strictly |
| `BCRYPT_ROUNDS` | 10–15 |
| `PAYMENTS_PROVIDER` | must not be `mock` |
| `PAYMENT_WEBHOOK_SECRET`, `UPLOAD_URL_SECRET` | ≥ 32 characters when set. Without `PAYMENT_WEBHOOK_SECRET` every payment webhook answers `503 WEBHOOK_NOT_CONFIGURED` (set it before a provider sends events). Without `UPLOAD_URL_SECRET` media links are signed with a key derived from `JWT_SECRET` |

Also set:

- `GOOGLE_CLIENT_ID` — **every** OAuth client id of the product, comma-separated: the web client id
  (the audience of tokens from Google Sign-In on Android and iOS) **and** the Android and iOS client
  ids (their authorized party). With only the web id, native sign-in is refused. `APPLE_CLIENT_ID`
  likewise lists the bundle / service ids.
- `UPLOAD_URL_SECRET`, `REDIS_URL`.

Tunable limits (defaults in `.env.example`): `DESIGN_REQUESTS_PER_DAY` (per designer),
`ATELIER_BROADCAST_FANOUT` (jewelers one broadcast reaches), `LEAD_OVERAGE_CAP` (overage charges
per subscription within a rolling billing cycle), `VISUALIZATION_JOBS_PER_DAY` (try-on jobs per
user), `TRIPO_MAX_MODEL_BYTES` (largest AI model accepted), `MEDIA_THROTTLE_LIMIT` (media requests
per client IP and minute; many users behind one carrier NAT share it — prefer a CDN in front of
media over lowering it).

## 3. Infrastructure requirements

- **PostgreSQL ≥ 13, in UTC.** Prisma stores `DateTime` as UTC wall-clock time. Raw SQL binds dates
  through `sqlTimestamp()` and migrations use `timezone('UTC', now())`; the e2e suite runs the
  database in Asia/Jerusalem to catch regressions. Connect migrations directly (not through a
  transaction-mode pooler).
- **Reverse proxy / TLS.** Terminate TLS in front of the API and set `TRUST_PROXY` to match, so
  per-client rate limits see the real client address.
- **Redis** for more than one API instance: rate limits (login, mail, media, unknown-e-mail
  lockout) and the config cache are per instance without it. The global request limit
  (`THROTTLE_LIMIT` per `THROTTLE_TTL_MS`) is per instance even with Redis.
- **Sessions and WebSockets (`/ws`).** Ending all sessions (sign out everywhere, password change or
  reset, account deletion) takes effect at once for HTTP on every instance (access tokens carry
  the account's session version). Open sockets are closed on the instance that handled the
  request; on other instances a socket of that account can no longer join conversations, and
  closes when its token expires (15 min by default). A Socket.IO Redis adapter would close them
  everywhere at once.
- **Media storage.** In production uploads and generated files are stored in PostgreSQL
  (`STORAGE_DRIVER=database`, table `upload_blobs`), so they survive deploys and restarts on hosts
  without a persistent disk and work across instances. They count toward the database's size:
  watch it, and move to object storage (S3 / R2) as volume grows. `STORAGE_DRIVER=local` keeps
  files in `/app/uploads-local` (needs a persistent volume). The S3 presign/confirm flow is not
  implemented and answers 501 in production. A CDN or caching proxy in front of the signed media
  URLs is recommended.
- **Exports and pictures.** STL / OBJ exports, HD pictures (1600 px), design preview pictures and
  try-on images are built from each design's parameters by the parametric geometry in
  `backend/src/jewelry` — the same code the app's 3D studio runs (synced into the app by
  `app/scripts/sync-jewelry-geometry.cjs`). Rendering is on the CPU in slices, so the API keeps
  answering; on a small instance an HD picture takes several seconds (the app polls the job).
  STEP export is not available (400 `EXPORT_FORMAT_UNSUPPORTED`).
- **Try-on** (PRD 5.10) works when the `phase2_visualization` flag is on and the plan includes
  `personal_visualization` (Designer Pro). The designer places the piece on their photo in the app;
  the server composes the picture at that placement. The transparent overlay the app places
  (`GET /visualization/designs/:id/overlay`) is served only to the design's owner, with their
  bearer token (the app fetches it with its session: an Android image view drops request headers).
- **HTTP keep-alive.** Idle client connections stay open 65 s (`KEEP_ALIVE_TIMEOUT_MS` in
  `backend/src/bootstrap/configure-app.ts`), longer than the proxies in front of the API keep
  theirs. With Node's 5 s default, a request sent on a connection the server had just closed
  failed without an answer, e.g. the first photo upload after a short pause.
- **AI inspiration** uses the Tripo API v3 (international region, `openapi.tripo3d.ai`) and needs
  `TRIPO_API_KEY` (from https://developers.tripo3d.ai/en/keys); without it the request is refused
  (503 `AI_NOT_CONFIGURED`) — no stand-in models. With an inspiration picture the model is made
  from the picture (image to model), otherwise from the note. `TRIPO_MODEL` picks the model
  version (default `v2.5-20250123`; `v3.1-20260211` is the best quality and costs more). Each
  generation is charged to the Tripo account (top up its credits); every signed-in user may run
  `ai_limits.dailyPerUser` generations a day (default 10, AppConfig). Generated models are stored
  like other files (in the database in production), up to `TRIPO_MAX_MODEL_BYTES` each.
- **Background jobs** (`JOBS_ENABLED=true`): outbox delivery, subscription lifecycle, visualization
  retention purge (also once at start-up), stale AI and render jobs, expiring pending quotes past
  their `validUntil` (every 10 minutes), and rendering design pictures that are missing or out of
  date (every 2 minutes). All are safe to run on several instances at once (conditional updates).

## 4. Payments

No real payment provider is integrated. With `PAYMENTS_PROVIDER` empty (production), paid-plan
checkout and jewelry payment intents answer **503 PAYMENT_PROVIDER_NOT_CONFIGURED** (fail closed).
A configured `STRIPE_SECRET_KEY` without an integration also fails closed. When a provider is
integrated, its adapter translates provider events into the webhook contract below.

**Webhook** `POST /api/v1/webhooks/payments`:

- The signature is verified over the exact raw bytes, before anything is parsed:
  `x-webhook-signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, 5-minute tolerance.
  Unsigned or wrongly signed: 401. Body larger than the limit: 413.
- Body `{ provider, providerEventId, type, payload, subscriptionId?, checkoutId?, invoiceId?, amount?, currency? }`.
  `(provider, providerEventId)` is the idempotency key: redeliveries are recorded once and applied once.
- Answers: **201** when the event is recorded, whatever its outcome — including a signed body that
  cannot be read, and an unexpected failure while applying it (both recorded as `NEEDS_REVIEW`);
  **503 `WEBHOOK_RETRY`** for a transient database failure — the provider must retry;
  **503 `WEBHOOK_NOT_CONFIGURED`** while `PAYMENT_WEBHOOK_SECRET` is not set.
- Types:
  - `checkout.completed` — `checkoutId`, the exact amount and currency of the checkout, and
    **`invoiceId` of the first charge** (required: it is recorded, so that invoice's own
    `invoice.paid` does not add a second period). Activates the plan once. It replaces whatever
    the user had live — a free plan or a trial, of either role: a user has one live subscription.
    Announcing it again with the same invoice is ignored; another charge on a completed checkout
    (another invoice, or none named) is `NEEDS_REVIEW`.
  - `invoice.paid` — `subscriptionId`, `invoiceId`, the price **agreed for that subscription**
    (not today's catalog price). One renewal per invoice. A lapsed subscription is reactivated if
    the user has not started another; a cancellation the user asked for stays in force. The first
    charge's own `invoice.paid` may arrive without a known subscription, before, after or during
    `checkout.completed`: it is settled by it (`IGNORED`) when the amounts match — only when that
    invoice id is the first invoice of exactly one subscription bought through a completed
    checkout. Any other `invoice.paid` without a known subscription is `NEEDS_REVIEW`. The adapter
    should send provider invoice ids that are unique within the provider.
  - `invoice.payment_failed`, `subscription.cancelled`.
  - Other types are recorded and ignored — unless they report an amount, then `NEEDS_REVIEW`.
- Every event is stored with what it says was paid (`checkoutId`, `invoiceId`, `amount`,
  `currency`) and an outcome: `APPLIED`, `IGNORED`, `NEEDS_REVIEW`, or `LEGACY` (before outcomes
  existed). **Monitor `payment_events.outcome = 'NEEDS_REVIEW'`** (also logged as errors): money
  that could not be applied safely — wrong amount, unknown subscription or checkout, double
  payment, payment for a cancelled, replaced or deleted account's subscription, a checkout already
  under review. A checkout with money under review is marked `NEEDS_REVIEW`; nothing more is applied
  on it automatically. Repeats of one unapplied payment (same type, invoice/checkout and amount)
  are a single item.
- **Cancellation at the provider is manual for now.** When a user cancels or deletes their account,
  the outbox records `event_logs.eventKey = 'subscription.provider_cancellation_required'` (and
  logs an error): stop that subscription's billing at the provider. A provider integration
  replaces this with the provider's cancel call.
- Lead overage is charged at the plan's current catalog overage price.

## 5. Contract changes the mobile app must follow

The app in `app/` implements these, except two it does not use yet: it does not listen to the
`quote:updated` socket event (an accept with stale terms gets `409 QUOTE_CHANGED` and shows the
current ones), and it has no paid-plan checkout flow (the pricing screen subscribes to trials and
free plans only; buying needs the provider integration of section 4).

| Area | Change |
|---|---|
| Sign-up | `POST /auth/register` returns `{ user, requiresEmailVerification: true }` and no tokens; sign-in answers `403 EMAIL_NOT_VERIFIED` until the e-mailed link is opened; offer "resend" (`POST /auth/resend-verify`). |
| Locked accounts | `403 ACCOUNT_LOCKED` after repeated failures (also for unknown e-mails, and for wrong current passwords on the change-password form). |
| Sessions | Ending all sessions (sign out everywhere, password change or reset) ends every access token at once: `401` on the next request. After changing the password, sign in again with the new one. A password change or role switch that raced the end of all sessions answers `401` (session ended), and a sign-in with a password changed meanwhile answers `401` like a wrong password. |
| Refresh | only `401` means "sign out"; 5xx is retryable. |
| Quotes | `POST /quotes/:id/accept` requires `{ expectedTotalPrice, expectedCurrency }` as shown on the card; `409 QUOTE_CHANGED` returns the current terms. Listen to the `quote:updated` socket event (also sent when a jeweler's account deletion withdraws a quote). |
| Jewelry payment | `POST /jewelry-payments/intents` takes `{ quoteId }` only (amount comes from the accepted quote). |
| Media | private media is served only with the signed `contentUrl` / `thumbnailUrl` / `outputUrl` returned by the API (or a bearer token); raw upload ids are not enough. |
| Socket | access token in the handshake `auth.token` (never the query string); reconnect after a token refresh. |
| Subscriptions | paid plans without a trial answer `402 PAYMENT_REQUIRED` on subscribe; use checkout. |
| Design requests | `409 ALREADY_REQUESTED` (every jeweler already holds an open request for the design), `409 NO_ELIGIBLE_JEWELERS`, `429 REQUEST_QUOTA_EXCEEDED`. |
| Try-on | `429 VISUALIZATION_QUOTA_EXCEEDED` after the daily number of try-on jobs. |
| Reviews | the business-profile editor lists the jeweler's own reviews with `GET /reviews/mine` (also while the profile is offline); `GET /reviews?jewelerProfileId=` is the public listing. |
| Designs | a completed design cannot be edited, rolled back or republished (`409 DESIGN_COMPLETED`). |
| Public profiles | jeweler phone / e-mail are no longer public (shared in the handoff after acceptance). |
| Jeweler orders (round 5) | each jeweler has their own order status: `GET /jeweler-profiles/me/orders` items carry `myStatus` (NEW, QUOTE_SUBMITTED, NEGOTIATING, COMPLETED, DECLINED, CLOSED) and the response `tabCounts`; tabs filter on it. `POST /jeweler-profiles/me/orders/:requestId/decline` (`409 QUOTE_PENDING` / `ORDER_COMPLETED`). `GET /atelier/requests/:id` shows a jeweler all their own quotes on the design. |
| Quotes (round 5) | accepting a quote priced on a design that changed since answers `409 DESIGN_CHANGED_SINCE_QUOTE` (the jeweler re-prices with `PATCH /quotes/:id`); quoting or requesting a listing past `expiresAt` answers `409 DESIGN_EXPIRED`; editing a quote that is no longer pending answers `409 QUOTE_NOT_PENDING`. `GET /designs/:id/quotes` (owner) lists every quote of a design. Chat messages and the live `message:new` quote card include the quote with its design (item type, parameters). |
| Roles (round 5) | `POST /auth/roles { role: DESIGNER \| JEWELER }` adds a role and returns new tokens (ADMIN → 400). |
| Chat (round 5) | `GET /conversations/:id` (participants with `lastReadAt`); `q` also matches the other participant's name and business name; each conversation keeps one unread `message.new` notification, read with the conversation. |
| Validation (round 5) | designs are validated against their item type on create and before publishing (400 with `errors`); a jeweler profile phone must be E.164 (`+972…`); `PNG_HD` exports need the `hd_export` entitlement (`403 PAYWALL`). A password's letter may be of any alphabet. |
| Uploads (round 5) | `DELETE /uploads/:id` removes an upload of mine that nothing uses (`409 UPLOAD_IN_USE` otherwise). Deleting an account removes the user's files nothing else uses (a picture sent in a chat stays). A listed design's inspiration / custom-element pictures are public like its thumbnail. |
| Banners (round 5) | `GET /atelier/banners` returns what is shown and `sponsored: true`, never the budget. |
| Portfolio | `POST /jeweler-profiles/me/portfolio` with a picture already in the portfolio returns the existing item (no duplicate); publishing from the app adds only pictures not saved yet. |
| Build | release builds need `API_BASE_URL` (https) and `GOOGLE_WEB_CLIENT_ID` at build time — a release bundle without an https `API_BASE_URL` fails to build (for Xcode archives, export it in `ios/.xcode.env.local`); Android release builds are signed with the upload key from `MALINVOSKY_UPLOAD_*` Gradle properties (never the debug key). Sessions are stored in the OS keychain; when the keychain refuses a write the session falls back to app storage (and moves back once the keychain works). |

## 6. Operations

- **Health:** `GET /api/v1/health` (database + Redis).
- **Watch:**
  - `payment_events` with `outcome = 'NEEDS_REVIEW'`;
  - `event_logs` with `eventKey = 'subscription.provider_cancellation_required'` (cancel at the provider);
  - `outbox_events` with `deadAt` set (notifications that failed 10 times);
  - error logs — `Prisma P2025` errors (a record vanished under an update) usually point at a bug.
- **Support tools (round 5):** `POST /admin/designs/:id/unlock { fields, reason }` (admin) unlocks
  locked design fields; the reason is kept in `audit_logs` (`design.unlock`). Account lockout is set
  by `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` (the `lockout` app-config row was never read and is
  no longer seeded; an existing row can be deleted). Chat system messages for an accepted quote are
  the `system_message_templates` rows (Hebrew): the seed creates them and replaces only the original
  English text, never an operator's wording.
- **Feature flags** start disabled (`phase2_*`, `phase3_*`); enable them deliberately. Geo search
  (`phase3_postgis`) only ever reveals the rounded (~1 km) location.
- **Backups:** daily PostgreSQL backups plus the media volume.
- **Secrets:** rotating `JWT_SECRET` invalidates the access tokens handed out (the app gets new
  ones with its refresh token, so nobody is signed out — to sign everyone out, end their sessions)
  and, when `UPLOAD_URL_SECRET` is not set, the issued media links; rotating `UPLOAD_URL_SECRET`
  invalidates issued media links (they expire within minutes anyway); do not rotate
  `TRIAL_HASH_SECRET`.

## 7. Development and verification

- `npm test` (in `backend/`) — unit + e2e regression suites on a real PostgreSQL (embedded locally,
  or `TEST_DATABASE_URL`).
- `npm run migrations:check` — fails when migrations and `schema.prisma` disagree
  (`--print-sql` prints the SQL for a new migration).
- `npm run test:e2e:local` — builds the API and drives the main flows against it with the demo seed
  (`SMOKE_API_PORT` / `SMOKE_PG_PORT` move it off ports 3100 / 55433; it never uses the AI or mail
  keys of a developer's `backend/.env`).
- App (in `app/`): `npm run typecheck`, `npm run lint`, `npm test`.
- CI (`.github/workflows/ci.yml`) runs all of the above on every pull request and every push to
  `main`, against a PostgreSQL service, and builds both container images. Dependabot (`.github/dependabot.yml`)
  proposes dependency and action updates weekly.

## 8. Known limitations

- No real payment provider (provider-side cancellation is manual), no S3 storage driver, no
  Socket.IO Redis adapter (see above).
- The unknown-e-mail lockout and other limiters are per instance without Redis.
- No minimum-app-version gate: contract changes need a forced store update.
- The mobile app has not been built for devices or tested on devices as part of this work; verify
  sign-in (including Google), media, try-on (WebView) and the keychain session store on real
  Android and iOS devices before release.
- Toolchain dependencies (React Native CLI / Metro, Jest, Tailwind) still report audit findings that
  need major upgrades (React Native 0.87, Jest 30, Tailwind 4); they run on developer machines and
  CI, not in the shipped app or API. In `backend/`, `npm audit --omit=dev` reports only the Prisma
  CLI (`deepmerge-ts` through `@prisma/config`; fixed in Prisma 7): it runs migrations and the seed
  on the project's own configuration, and the API never loads it. The rest (Jest 29 chain) is
  development-only.
- `@nestjs/swagger` 11 pins a vulnerable `js-yaml`; `backend/package.json` overrides it to the
  fixed 5.4 line. Remove the override when moving to `@nestjs/swagger` 12 (NestJS 12).
- A refresh whose answer is lost (app suspended, connection dropped after the server rotated the
  token) leaves the app with the old refresh token; its next use counts as reuse and signs the
  user out. The app gives up on a refresh after 15 s (so one hung call cannot block every
  request), which makes this more likely on very slow networks. A short grace period for the
  previous token is a product / security decision (open).
- Private media links last 15 minutes (`UPLOAD_SIGNED_URL_TTL_SECONDS`): an open chat thread
  fetches fresh ones for its newest page before they expire, but media in older pages loaded with
  "earlier messages" refreshes only when the thread is reopened; the studio uses the links of its
  latest load of the design.
- The demo seed's accounts use published passwords — never run it outside local development.
