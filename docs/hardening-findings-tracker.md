# Open findings tracker (source of truth across context compactions)

## Review #1 (auth + marketplace) — status
- [x] C1 trust proxy applied + prod requires explicit TRUST_PROXY (not 'true')  (test/auth/client-ip, src/bootstrap/trust-proxy.spec, env.validation.spec)
- [x] C2 app signup -> verify-email flow (app 0e47790); legacy PENDING users resend CLI (cli:resend-verification)
- [x] I1 accept: mandatory expectedTotalPrice+expectedCurrency, CAS claim in tx, quote:updated socket event (test/marketplace/quote-races, quote-decisions, realtime)
- [x] I2 atomic login-attempt reservation before bcrypt
- [x] I3 same lock response for unknown emails (limiter), reset clears
- [x] M1 refresh claim+insert in one tx
- [x] M2a quote create FOR SHARE recheck; [x] M2b auto-decline from locked rows
- [x] M3 outbox enqueue inside accept tx (+tx timeout); [ ] P2028/P2034 mapping (with M11)
- [x] M4 atomic per-account mail cap via limiter
- [x] M5 don't await SMTP (timing oracle)
- [x] M6 OAuth: throttle unknown-kid JWKS refresh, azp check, email P2002->409, refuse PENDING OAuth accounts
- [x] M7 CORS empty default in prod, reject http origins, BCRYPT_ROUNDS max, test secret in known list, .env.example, remove appUrl
- [x] M8 clamp socket expiry timer (+ app reconnect)
- [x] M9 quote total <= Decimal(12,2) (QUOTE_TOTAL_TOO_LARGE)
- [x] M10 completed design cannot be republished / manual COMPLETED blocked
- [x] M11 global Prisma error mapping (P2002 409, P2023/P2025 404, P2028 503, P2034 409)
- [x] M12 invalidate other reset tokens after reset
- [x] M13 dedupe step in auth_identity_unique migration
- [x] currency codes normalized upper-case (quote DTOs)

## Billing review (agent, on 8124da3)
- [x] B-I1 verified payment dropped after sweep made sub terminal (EXPIRED) -> reactivate/new ACTIVE under user lock; TRIALING->PAST_DUE edge; mark unapplied events
- [x] B-I2 no route to paid plan except live trial -> server-side checkout session activated by webhook
- [x] B-I3 webhook not tied to invoice/amount; both invoice.paid & payment.succeeded extend -> one activating type, invoice-id idempotency, amount/currency check, provider ref, ignore stale
- [x] B-I4 lead drain: 1 lead per (design, jeweler); per-requester rate limit; ArrayMaxSize TARGETED; overage cap; sourceRequestId on charge; extraLeadPrice?.gt(0)
- [x] B-I5 trial reuse via delete+re-register -> trial grants keyed by HMAC(normalized email)
- [x] B-M1 webhook: user-row lock + conditional updates; partial unique index one live sub per user (check drift tool)
- [x] B-M2 lead claim requires periodStart <= now
- [x] B-M3 free renewal update must include cancelAtPeriodEnd=false
- [x] B-M4 PAST_DUE grace blocks other plans -> PAST_DUE+cancelAtPeriodEnd -> CANCELLED (or replaceable)
- [x] B-M5 accept price CAS (same as I1)
- [x] B-M6 zero recipients -> 409 NO_ELIGIBLE_JEWELERS (documented in production-readiness section 5)
- [x] B-M7 webhook secret >=32 if set, mock opt-in, providerEventId unique per provider
- [x] B-tests (most added; mutation-checked lead lock + intent lock): lead lock test w/ enforcement (1 lead, 2 concurrent -> 201+409); ACTIVE/PAST_DUE time limit; raw-body bytes (odd whitespace); webhook edge cases (bad JSON/validation 400 no row, unknown sub no effect, no revive EXPIRED/CANCELLED, subscription.cancelled); delivery rollback; NO_LEADS under enforcement; no overage when enforcement off; concurrent payment intents; mock provider refused in production; sweep concurrency + lead allocation on renewal; trial scoping; PAST_DUE grace edges

## Billing review round 2 (agent, on b7d7470)
- [x] R2-A overage cap counts from currentPeriodStart which a prepaid renewal moves into the future -> count from start of the period containing now (rolling one-cycle window)
- [x] R2-B cancel() without owner lock/transaction can cancel a renewal just applied -> lock users row, re-read, conditional update
- [x] R2-C NEEDS_REVIEW rows: persist normalized fields (checkoutId/invoiceId/amount/currency), ids in notes, checkout session marked paid-but-unapplied, dedupe review items
- [x] R2-D unknown type with amount>0 -> NEEDS_REVIEW; completed checkout: compare amount before IGNORED; signed-but-invalid body -> store NEEDS_REVIEW (2xx); apply exceptions -> NEEDS_REVIEW in separate tx (2xx)
- [x] R2-E checkout.completed should carry provider invoice id -> insert SubscriptionInvoice in same tx (no second cycle for first charge)
- [x] R2-F store agreed price/currency on subscription; renewals compare against it; 'paying' = agreed price > 0
- [x] R2-G request dedupe permanent -> only against open requests (OPEN/QUOTE_SUBMITTED/NEGOTIATING) / allow after withdrawn/expired; broadcast should skip reached jewelers not 409
- [x] R2-H deadlocks: sort recipients before locking subscriptions; user serialization locks FOR NO KEY UPDATE
- [x] R2-I migration: cleanup keeps paid (ACTIVE priced) over newer; historical outcome backfill (LEGACY); jewelry intent events outcome; lock_timeout
- [x] R2-J TRIAL_HASH_SECRET prod validation (>=32); leading '+' collapse; doc rotation
- [x] R2-K softDelete cancels subscriptions + open checkout sessions; reactivation keeps cancelAtPeriodEnd; (checkout cancels other role's plan = rule one-live-per-user, document)
- [x] R2-nits demo seed subscription vs index; unused ServiceUnavailableException import
- [x] R2-tests: webhook vs sweep/subscribe/checkout interleaving; invoice for cancelled sub; invoice without id; subscription.cancelled applied; lead allocation on invoice.paid (JEWELER plan); checkout double payment / expired honoured / trial replaced / unknown id / currency mismatch / concurrent completions / PAST_DUE refusal; requester lock concurrency; overage lock concurrency; recordTrialsBeforeDeletion real test; cancel races; migration 3+ dups / paid preference

## Billing round 2 notes
- raw-body parser on /webhooks/payments (signed non-JSON bodies are recorded NEEDS_REVIEW); transient DB errors -> 503 WEBHOOK_RETRY; deterministic apply failures -> NEEDS_REVIEW
- new migration 20261013100000_billing_agreed_price (subscriptions.price/currency NOT NULL: stop old instances first); lock_timeout in all hardening migrations
- docs pass: TRIAL_HASH_SECRET required in prod + rotation effect; ATELIER_BROADCAST_FANOUT; one live subscription per user across roles; checkout.completed should carry the first invoice id; LEGACY outcome; failed migration on lock_timeout -> migrate resolve --rolled-back

## Billing review round 3 (agent, on bf3431b)
- [x] B3-1 (Imp) late invoice.paid on EXPIRED sub of a DELETED account is APPLIED -> lockedSubscription loads owner deletedAt; paid invoice for deleted owner -> NEEDS_REVIEW (+test)
- [x] B3-2 (Imp) outbox has no consumer for subscription.cancelled (silently processed) -> explicit handler: logs error "cancel at provider manually" until a provider integration exists; fix comments/claims; docs
- [x] B3-3 (Imp) checkout.completed without invoiceId + first invoice.paid => 2 periods -> require invoiceId (NEEDS_REVIEW otherwise); recording the invoice resolves earlier NEEDS_REVIEW items for that invoice id (+tests both orders)
- [x] B3-4 payload with \u0000 / lone surrogate can never be stored (500 forever) -> sanitize every JSON written to payment_events (+test)
- [x] B3-5 PrismaClientUnknownRequestError treated as permanent (fails safe) -> kept (fails safe: NEEDS_REVIEW, never lost)
- [x] B3-6 review collapse ignores type (refund/dispute hidden) -> include type; fix serialization comment
- [x] B3-7 NEEDS_REVIEW checkout not terminal (later exact payment applies) -> any further money on a NEEDS_REVIEW session -> review
- [x] B3-8 oversized webhook body -> 500 (filter swallows body-parser 413) -> AllExceptionsFilter passes through status<500 errors; normalize API prefix slashes for raw mount
- [x] B3-9 SET lock_timeout session-wide -> SET LOCAL (verify implicit tx); dedupe ranking ACTIVE before PAST_DUE; data-modifying CTE instead of temp table
- [x] B3-10 docs: TRIAL_HASH_SECRET required, renewals at agreed price, unknown types w/ money -> review, deploy: stop old instances + migrate resolve on lock timeout, webhook contract invoiceId, overage priced at catalog, backfill uses today's catalog
- [x] B3-11 free re-delivery bypasses subscription requirement under enforcement -> require entitled subscription (no lead) when enforcing
- [x] B3-12 deletion vs accept deadlock: email change = key update (FOR UPDATE) -> withdraw quotes (FOR UPDATE) before the user scrub (with M5)

## Round-2 review of non-billing fixes (agent, on b73e536)
- [x] C1 app must send accept fields -> app updated in lockstep (doc: lockstep release + store force-update); [ ] min-app-version gate (future)
- [x] I1 revocation not immediate: add users.sessionsValidAfter; JWT strategy + socket connect/join check iat; revoke-all/password change/reset stamp; refresh rotation locks user FOR SHARE + refuses tokens created before stamp; test reconnect-after-revoke
- [x] I2 azp: GOOGLE_CLIENT_ID must list web+android+ios ids; test aud=web azp=android; doc/.env.example
- [x] I3 migrations edited after commit: never deployed (new in this work) -> document; freeze after first deploy
- [x] M1 deadlocks: accept FOR KEY SHARE author user after design lock; deletion revoke refresh tokens before user update; user serialization locks FOR NO KEY UPDATE
- [x] M2 correct password resets attempts even for non-ACTIVE; verification clears lock
- [x] M3 unknown-email lockout imperfect (doc: per instance without Redis)
- [x] M4 accept CAS only price/currency/validity (doc eta/notes); auto-decline notifications via outbox
- [x] M5 deletion: withdraw quotes via FOR UPDATE select; quote:updated + owner notification
- [x] M6 owner's review management empty when profile not published -> owner sees all
- [x] M7 try-on daily cap (VISUALIZATION_JOBS_PER_DAY); media default kept at 600/IP (carrier NAT) + CDN recommendation documented
- [x] M8 findRequest targets show competitors -> filter; quotes.findOne leftAt
- [x] M9 Tripo download: no redirect follow / size cap
- [x] M10 token TTL read outside tx (no second connection inside tx)
- [x] M11 P2025 -> 404 but log error with stack
- [x] M12 shutdown: await all pending mail (loop)
- [x] M13 migrations: SET lock_timeout; doc
- [~] R2-tests: accept CAS currency/validity in-tx; quote:updated on accept/decline/auto-decline; reset user lock; password change + socket disconnect; revoked reconnect; outbox lease renewal; try-on READY; deletion scrub fields; leftAt socket join/media/quote create; migration 120000 branches  [done: revoked reconnect, password change sessions, quote:updated on deletion, auto-decline outbox, migration branches; open: see W-tests remaining]

## Found while testing
- [x] change-password: wrong current-password attempts count toward lockout; all sessions end (app signs in again)
- [x] multi-instance: documented (session version makes HTTP immediate everywhere; sockets cannot join after revocation)
- [x] outbox fresh events delayed by engine-vs-node clock skew -> nextAttemptAt NULL = due now (reliability "due at once")

## WP5-8 review (agent, on 8124da3)
- [x] W-C1 geo search radius binary-search reveals exact location -> distance from rounded coords + min quantized radius (>= 2-3 km) + test
- [x] W-I1 upload quota bypass via parallel uploads + orphan files on insert failure -> per-user xact lock around check+insert; cleanup file in catch
- [x] W-I2 render quota bypass via parallel -> owner row lock in tx (AI pattern)
- [x] W-I3 concurrent reviews (different authors) deadlock (FK KEY SHARE vs FOR UPDATE) -> lock profile before INSERT / FOR NO KEY UPDATE; 2-author parallel test
- [x] W-I4 deleted/suspended users keep sockets -> user:<id> room + disconnectSockets on delete/suspend/password reset/revoke-all; recheck status in onJoin
- [x] W-I5 app-config Redis cache masks migration changes (no TTL / version validation) -> validate cached version vs DB or TTL
- [x] W-M1 legacy upload references trusted -> isPublic/canRead require referencing owner == upload owner (+ cleanup)
- [x] W-M2 visualization purge may delete uploads used elsewhere -> refuse non-dedicated input or copy
- [x] W-M3 outbox: completion fencing (where lockedUntil), attempts++ on claim (crash loops), smaller batch/lease renew
- [x] W-M4 AI stale sweep vs slow job overwrite -> conditional status updates; provider fetch timeouts
- [~] W-M5 migration (b,c done; a,d -> docs): review dedupe LOCK TABLE; recompute aggregates after dedupe; document CREATE INDEX locking / rolling deploy
- [x] W-M6 deletion traces: gallery filter deleted designs/owners; deleted jeweler PII (phone/email/businessName) scrub + withdraw pending quotes; accept refuses quote from deleted author [round 4: this guard was NOT in the code; added + test/privacy "author has deleted the account"]; public reviews only for published profiles
- [x] W-M7 conversations assertParticipant/list ignore leftAt
- [x] W-M8 designs: lock() lost update (CAS/version); transition conditional; accept bumps version; update refuses after COMPLETED (parameters frozen)
- [x] W-M9 generated outputs (AI/render) count against user upload quota -> exclude kind generated
- [x] W-M10 public jeweler projection must be allow-list (no phone/email/userId/publishStatus)
- [x] W-M11 UPLOAD_URL_SECRET validation in prod (>=32 if set)
- [x] W-M12 media GET under global throttle 100/min & CORP same-origin for private -> skip throttle for content route (has own auth) / CORP cross-origin for signed
- [x] W-M13 findRequest includes all quotes -> targeted jeweler sees competitors' prices
- [~] W-tests: MAC bound to id (replay sig on other id); thumbnail visibility by status; suspended/deleted/unverified bearer refused; READY only; path confinement; headers nosniff/CD/CORP; file-count limit; parallel uploads; assertOwnedImage READY/kind; foreign uploads for avatar/portfolio; chat IMAGE/AUDIO mismatch; signed URLs in designs/jeweler me/visualization; geo privacy; deletion (devices, requests, avatar, gallery, sockets); reviews parallel different authors + unpublished profile; AI parallel POSTs; failStaleJobs; render quota concurrency; FIELD_LOCKED via PATCH; concurrent lock(); outbox lease expiry/backoff/fencing; migration dedupe on duplicates  [done: MAC binding, suspended/ended-session bearer, READY only, path confinement, headers, file count, avatar/portfolio, chat type mismatch]

## Environment notes
- intermittent "Can't reach database server" at app start on loaded Windows dev box (PG process per connection); mitigated in tests: connect_timeout=30, connection_limit=24

## Later work packages
- WP9 seed split / feature flags / DTO max lengths elsewhere / Dockerfile / docs/production-readiness.md / .env.example / resend-verification script
- WP10 dependency upgrades (npm audit)
- WP11 app changes
- WP12 CI workflow
- Final holistic review + Gate 5 report (Hebrew)

## Found while working (round 3)
- [x] media route bearer auth ignored session version -> shared isCurrentSession() + static guard
- [x] webhook oversized body -> 413 (filter passes 4xx through)
- [x] embedded PG18 io_worker orphans on Windows -> io_method=sync in test/check/smoke clusters
- [x] mail log contained recipient addresses -> masked
- [x] app npm audit fix pulled nested react-native via nativewind 4.2.7 -> reverted, targeted patch updates only
- [x] WP10 backend deps (round 4): nest/proxy-addr/multer/engine.io/qs/fast-uri were already in 08bc79b; bcrypt 6 (drops node-pre-gyp -> tar critical gone), nodemailer 10.1.0 (own types, @types/nodemailer removed), @types/bcrypt 6, js-yaml override for @nestjs/swagger (5.4.3), nested js-yaml 4.3.2. Remaining: jest 29 chain (dev), deepmerge-ts via Prisma CLI (Prisma 7) — accepted, documented
- [x] W-tests remaining (round 4): FIELD_LOCKED via PATCH, concurrent lock(), jeweler me signed links were already covered (reliability, uploads); added thumbnail COMPLETED/ARCHIVED/removed + visualization outputUrl signed-only (uploads.e2e-spec), mutation-checked 5/5 killed
- [x] tighten test 'confirmation without the first invoice id' (assert note 'first charge' + session NEEDS_REVIEW): mutation survived via recordUnapplied safety net

## Final independent review + WP10 (round 4, 2026-10-13, on 08bc79b..cd8fc08)
Backend reviewer (bf3431b..08bc79b):
- [x] F1 change-password racing a reset overwrote the recovered password -> recheck passwordHash + sessionVersion under lockUser, 401 Session ended (test/auth/sessions)
- [x] F2 login with a password changed meanwhile / switch-role behind revoke-all issued live sessions -> tokens issued inside the locked tx after recheck (test/auth/sessions; switch-role tokens were proven to work before the fix)
- [x] F3 deletion vs accept deadlock with two open quotes of one jeweler on one design -> accept locks all open quotes of the design in id order before the claim (test/privacy)
- [x] F4 quote created during author deletion stayed PENDING + accept had no deleted-author guard -> create takes shareLockUser + recheck (401), accept refuses (409 QUOTE_NOT_PENDING) (test/privacy)
- [x] F5 second separately invoiced charge on a completed checkout IGNORED -> NEEDS_REVIEW unless the same first invoice (test/billing/checkout; two existing tests now send the same invoice id)
- [x] F6 first invoice's invoice.paid after/while checkout.completed stayed NEEDS_REVIEW -> pg_advisory_xact_lock per invoice id in both paths + settle when recorded at same amount (test/billing/checkout, deterministic interleaving via checkout_sessions row lock)
- [ ] note: admin suspension has no endpoint; a DB-level suspension does not bump sessionVersion nor close sockets (documented, not changed)
- [ ] note: oauthLogin issues tokens outside the account lock (fresh credential; not the stale-password class) — not changed
App/docs/CI reviewer (a67a5db..HEAD):
- [x] A1 stale keychain copy shadowed a newer AsyncStorage session -> savedAt stamp, newer wins, keychain reset on failed write (authStorage.test)
- [x] A2 remember-me=false re-persisted on refresh / role switch -> persist kept in state (authStore.test; jest transform for immer added)
- [x] A3 refresh had no timeout (one hung refresh blocked all) -> abort signal + race timeout (apiClient.test)
- [x] A3b refresh answer for a replaced session applied to / signed out the new one -> 'superseded' outcome (apiClient.test)
- [ ] A4 lost refresh response -> next refresh = reuse -> sign-out: needs a backend grace window (product/security decision, open; documented)
- [x] A5 AI generation outliving the 120 s wait was orphaned -> pending job per design (AsyncStorage), attached on next visit (pendingAiJobs.test)
- [x] A6 stale signed links: studio prefers the link of the current upload, freshest first; chat refreshes the newest page before links expire (media.test). Older chat pages: documented limitation
- [x] A7 release API_BASE_URL checked only at launch -> babel.config fails a release bundle without https URL (babelConfig.test + real @babel/core run)
- [x] Dependabot: ignore nativewind >=4.2.7 and react-native minor
- [x] Docs: 7 false/incomplete statements in production-readiness.md corrected (JWT rotation, app contract scope, WEBHOOK_NOT_CONFIGURED, resend --limit, migrate resolve from release image, CI triggers, global throttle per instance) + SMTP_URL encoding, audit status
- [ ] device-only checks (keychain linking/Podfile.lock, iOS keychain survives reinstall, offline sign-out resurrect) — need a device
Environment (round 4):
- [x] smoke script: SMOKE_API_PORT/SMOKE_PG_PORT (3100 is taken by another project here); TRIPO_API_KEY/SMTP_URL blanked so backend/.env keys never reach the smoke run
- [x] backend/.env created from the owner's values (gitignored; contains a real TRIPO_API_KEY)
- [x] row-locks: pg_advisory_xact_lock returns void -> Prisma cannot deserialize; select 1 FROM it (caught by the billing suite; money stayed NEEDS_REVIEW, never lost)
- [x] P1 (pre-existing, found by the app reviewer) publishing the business profile re-posted every saved portfolio picture -> duplicates. API: add is idempotent per (profile, upload) under lockJewelerProfile (test/marketplace/portfolio, red 2/3 -> green 3/3). App: preview adds only unsaved pictures (src/lib/portfolio + portfolio.test). Existing duplicate rows are not deduplicated (no migration).
## Single final code review (round 4 diff, after all development) — handled once, no further review loop
- [x] R1 overlapping session saves: an older save's keychain-failure cleanup could erase the newer copy -> writes serialized in order (authStorage.test, red -> green)
- [x] R2 attachedAiJob forgot a newer generation started meanwhile -> forgets only the attached job id (pendingAiJobs.test, red -> green)
- [x] R3 invoice.paid without a known subscription was settled by any recorded invoice with that id -> only the first invoice of exactly one subscription from a completed checkout (test/billing/checkout: renewal re-announced, id on two checkouts; red -> green); contract note in production-readiness §4
- [x] R4 remember-me off was reset by an unexpected sign-out -> the choice is kept; every sign-in screen states its own (authStore.test, red -> green)
- [x] R5 claimed older deadlock (owner deletes account while accepting on own design): NOT REAL — quote_events.actorUserId has no FK and accept's messages are SYSTEM (senderId null), so accept never references the owner row. Deterministic interleaving test added (test/privacy), green before any change; kept as regression guard
- [x] note: refresh timeout makes the open grace-window decision more likely to matter -> documented (§8 of production-readiness)
## Round 5 (2026-10-13): PRD conformance — full gap list (docs/prd-gap-audit.md), TDD, then one review
Audit: 5 independent reviewers, every PRD section vs code; tracker with statuses + implementation decisions D1–D8 in docs/prd-gap-audit.md.
Backend (tests: test/prd/prd-gaps, test/prd/prd-journey, test/marketplace/order-board, test/migrations/{seed,data-migrations}):
- [x] per-jeweler order status (DesignRequestTarget.status + migration with backfill + data-migration test); board tabs/counters/tabCounts; jeweler decline under the account lock (race test)
- [x] quote priced on changed design -> 409 DESIGN_CHANGED_SINCE_QUOTE (designHash fingerprint); listing expiry enforced (409 DESIGN_EXPIRED); quote expiry sweep (EXPIRED + event + order back to NEW) + index
- [x] GET /designs/:id/quotes; GET /quotes/:id with item type + parameters + business name; live QUOTE_CARD carries the quote; GET /atelier/designs/:id; jeweler sees own feed quotes on the request
- [x] Hebrew PRD system messages; seed replaces only the legacy English text (seed test); handoff event-log record without the phone
- [x] PRD ring chart IL 52–64 / US 6.00–10.75 (old sizes retired; seed test); measuring guide table kept compatible
- [x] POST /auth/roles; message.new notifications coalesced per conversation, read with the conversation; GET /conversations/:id; name search
- [x] banners without budget + sponsored; completedBy = business name; E.164 phone; parameter validation on create/publish; hd_export for PNG_HD; Unicode letters in password rule
- [x] account deletion purges unreferenced own uploads; DELETE /uploads/:id; listed design's inspiration/custom-element pictures readable; admin unlock of locked fields (audited)
- [x] login budget refunded on success (refund, not reset); dead `lockout` app-config removed; viz purge also at start-up; edit of non-pending quote -> 409 QUOTE_NOT_PENDING
- [ ] Sentry: needs DSN + approval to add the SDK (blocked); push: Firebase/APNs (blocked); ETL/data-driven item types: partial, not done this round
App (3 parallel work streams, each TDD; app jest 33 suites / 214 tests):
- [x] jeweler board/order details/decline/withdraw/notes/design by id/expiry/409 messages/business hours & area/sponsored tag/no fake +12/nearby gating
- [x] designer home (no fake updates, Hebrew labels, relative times, cache, trial reminder), My Designs paging, previous quotes, completed read-only, region at publish, IL/US size pairing, necklace PRD lengths, band-width check, pricing from API, try-on gating + photo deleted on refusal, HD paywall
- [x] role expansion, jeweler pricing entry, forgot-password title, Hebrew password letters, inbox server search/paging, read ticks, failed send keeps draft, socket rejoin/reload, WhatsApp button, error-code messages
- [x] own business profile without demo fallbacks; "לפני דקה"; unused i18n keys removed
## Single final code review (round 5, after all development) — handled once, no further review loop
- [x] V1 (app) useAsyncData: an older, slower response overwrote a newer one (filter switch / refresh) -> superseded request aborted and ignored (useAsyncData.test, red 2/2 -> green)
- [x] V2 (backend) soft-deleted designs kept their pictures "in use": account deletion never purged them -> isReferencedElsewhere ignores deleted designs (prd-gaps test, red -> green)
- [x] V3 (app) titleless design showed the sample "טבעת אירוסין יהלום" (and the edit field was labelled with it) -> item-type name / "עיצוב ללא שם" (designActions.test, red -> green)
- [x] dismissed: chat media fallback to /uploads/:id/content is not a leak — the server serves private media only with a valid signature or a participant's token (404 otherwise)
