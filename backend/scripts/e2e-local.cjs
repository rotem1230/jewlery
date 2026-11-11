/**
 * Local smoke run: embedded Postgres + the built API (dist/) + the demo seed, driving the main
 * flows over real HTTP. The regression suites live in test/ (npm test); this checks a whole
 * deployment-like boot end to end.
 * Usage: npm run test:e2e:local   (builds first)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
// initdb fails when PostgreSQL's own install path is non-ASCII (e.g. a Hebrew folder on Windows);
// EMBEDDED_PG_MODULE_DIR may point at a dir whose node_modules holds embedded-postgres on an ASCII path.
const EmbeddedPostgres = (
  process.env.EMBEDDED_PG_MODULE_DIR
    ? require('module').createRequire(path.join(process.env.EMBEDDED_PG_MODULE_DIR, 'index.js'))
    : require
)('embedded-postgres').default;

const ROOT = path.join(__dirname, '..');
// initdb cannot handle non-ASCII data-dir paths on Windows, so keep the throwaway cluster in the
// OS temp dir rather than next to the sources.
const DB_DIR = process.env.E2E_PG_DIR || path.join(os.tmpdir(), 'malinvosky-e2e-pg');
// Overridable for machines where another dev server already holds the default ports.
const PG_PORT = Number(process.env.SMOKE_PG_PORT) || 55433;
const API_PORT = Number(process.env.SMOKE_API_PORT) || 3100;
const BASE = `http://127.0.0.1:${API_PORT}/api/v1`;

const results = [];
function ok(name, detail = '') {
  results.push({ name, pass: true, detail });
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, pass: false, detail });
  console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

/** A flat-colour PNG photo, made by the API's own encoder (the build this run starts). */
function solidPng(width, height) {
  const { encodePng } = require(path.join(ROOT, 'dist', 'jewelry', 'png.js'));
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([40, 140, 150, 255], i);
  return encodePng({ width, height, data });
}

/** Uploads a file the way the app does (multipart `file`); returns its upload id. */
async function uploadPng(token, bytes, filename) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), filename);
  const res = await fetch(`${BASE}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const text = await res.text();
  if (res.status !== 201) throw new Error(`POST /uploads got ${res.status}: ${text.slice(0, 300)}`);
  const id = unwrap(JSON.parse(text))?.id;
  if (!id) throw new Error(`POST /uploads returned no id: ${text.slice(0, 300)}`);
  return id;
}

async function api(method, urlPath, { token, body, expectStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  const expected =
    expectStatus !== undefined
      ? expectStatus
      : method === 'GET' || method === 'DELETE'
        ? 200
        : [200, 201];
  const okStatus = Array.isArray(expected)
    ? expected.includes(res.status)
    : res.status === expected;
  if (!okStatus && res.status >= 400) {
    const err = new Error(
      `${method} ${urlPath} expected ${JSON.stringify(expected)} got ${res.status}: ${text.slice(0, 500)}`,
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return { status: res.status, json, raw: text };
}

function unwrap(json) {
  // transform interceptor wraps as { success, data }
  if (json && typeof json === 'object' && 'data' in json && json.success !== false) {
    return json.data;
  }
  return json;
}

// A loaded machine can take longer than a minute to boot the API: SMOKE_HEALTH_TIMEOUT_MS raises it.
async function waitForHealth(timeoutMs = Number(process.env.SMOKE_HEALTH_TIMEOUT_MS) || 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API health timeout');
}

async function runCmd(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // No shell: the commands are node + absolute script paths, which may contain spaces.
      shell: false,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
      process.stderr.write(d);
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${err}`));
    });
  });
}

async function main() {
  console.log('\n=== Starting embedded Postgres on', PG_PORT, '===\n');
  if (fs.existsSync(DB_DIR)) {
    fs.rmSync(DB_DIR, { recursive: true, force: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: 'mailnvosky',
    password: 'mailnvosky',
    port: PG_PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // No I/O worker processes (PostgreSQL 18): on Windows they can outlive a stopped server
    // and keep shared memory, so the next cluster fails to start.
    postgresFlags: ['-c', 'io_method=sync'],
  });

  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('mailnvosky');
  } catch (e) {
    // may already exist
    console.log('createDatabase note:', e.message);
  }

  const DATABASE_URL = `postgresql://mailnvosky:mailnvosky@127.0.0.1:${PG_PORT}/mailnvosky?schema=public`;
  const env = {
    DATABASE_URL,
    REDIS_URL: '', // redis optional — service is graceful
    PORT: String(API_PORT),
    NODE_ENV: 'development',
    JWT_SECRET: 'e2e-test-secret-min-32-characters!!',
    REGISTRATION_OPEN: 'true',
    API_PREFIX: 'api/v1',
    // Demo accounts and showcase data (never in production) and the fake payment provider.
    SEED_DEMO_DATA: 'true',
    PAYMENTS_PROVIDER: 'mock',
    // The API also reads backend/.env: a developer's real keys there must not turn the smoke run
    // into paid AI calls or real e-mail.
    GEMINI_API_KEY: '',
    SMTP_URL: '',
  };
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [ROOT] });

  console.log('\n=== Migrate ===\n');
  await runCmd(process.execPath, [prismaCli, 'migrate', 'deploy'], env);

  console.log('\n=== Seed ===\n');
  await runCmd(process.execPath, [prismaCli, 'db', 'seed'], env);

  console.log('\n=== Enable all phase flags (temporary) ===\n');
  const { Client } = require('pg');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(
    `UPDATE feature_flags SET enabled = true WHERE key LIKE 'phase2_%' OR key LIKE 'phase3_%'`,
  );
  const flags = await client.query(`SELECT key, enabled FROM feature_flags ORDER BY key`);
  console.table(flags.rows);
  await client.end();

  console.log('\n=== Start API ===\n');
  const apiProc = spawn('node', ['dist/main.js'], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  apiProc.stdout.on('data', (d) => process.stdout.write(`[api] ${d}`));
  apiProc.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));

  try {
    await waitForHealth();
    ok('health');

    // Login seed designer
    let designerToken;
    try {
      const login = await api('POST', '/auth/login', {
        body: { email: 'designer@dev.mailnvosky.local', password: 'Designer123!' },
        expectStatus: 201,
      }).catch(async (e) => {
        // Nest may return 200
        if (e.status === 200) return { status: 200, json: e.body };
        // try 200 without expect
        return api('POST', '/auth/login', {
          body: { email: 'designer@dev.mailnvosky.local', password: 'Designer123!' },
        });
      });
      const data = unwrap(login.json);
      designerToken = data?.tokens?.accessToken || data?.accessToken;
      if (!designerToken) throw new Error(JSON.stringify(login.json).slice(0, 300));
      ok('auth/login designer');
    } catch (e) {
      fail('auth/login designer', e.message);
      throw e;
    }

    let jewelerToken;
    try {
      const login = await api('POST', '/auth/login', {
        body: { email: 'jeweler@dev.mailnvosky.local', password: 'Jeweler123!' },
      });
      const data = unwrap(login.json);
      jewelerToken = data?.tokens?.accessToken || data?.accessToken;
      if (!jewelerToken) throw new Error(JSON.stringify(login.json).slice(0, 300));
      ok('auth/login jeweler');
    } catch (e) {
      fail('auth/login jeweler', e.message);
    }

    // Public / config
    try {
      await api('GET', '/config/public');
      ok('config/public');
    } catch (e) {
      fail('config/public', e.message);
    }

    try {
      const f = await api('GET', '/feature-flags', { token: designerToken });
      ok('feature-flags', JSON.stringify(unwrap(f.json)).slice(0, 120));
    } catch (e) {
      fail('feature-flags', e.message);
    }

    // Master data / wizard
    let itemTypeId;
    try {
      const r = await api('GET', '/wizard/item-types', { token: designerToken });
      const items = unwrap(r.json);
      const list = Array.isArray(items) ? items : items?.items || items?.data || [];
      itemTypeId = (list.find((i) => i.code === 'RING') ?? list[0])?.id;
      if (!itemTypeId) throw new Error('no item types: ' + JSON.stringify(r.json).slice(0, 200));
      ok('wizard/item-types', list.map((i) => i.code).join(','));
    } catch (e) {
      fail('wizard/item-types', e.message);
    }

    try {
      await api('GET', '/master-data/metals', { token: designerToken });
      ok('master-data/metals');
    } catch (e) {
      fail('master-data/metals', e.message);
    }

    try {
      await api('GET', '/home/summary', { token: designerToken });
      ok('home/summary designer');
    } catch (e) {
      fail('home/summary designer', e.message);
    }

    // Create design
    let designId;
    try {
      const r = await api('POST', '/designs', {
        token: designerToken,
        // A design is created and published only with a valid specification (a ring needs size and metal).
        body: {
          itemTypeId,
          title: 'E2E Ring',
          parameters: { size: { standard: 'IL', sizeCode: '54' }, metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' } },
        },
      });
      const d = unwrap(r.json);
      designId = d?.id;
      if (!designId) throw new Error(JSON.stringify(r.json).slice(0, 300));
      ok('designs create', designId);
    } catch (e) {
      fail('designs create', e.message);
    }

    try {
      await api('GET', '/designs', { token: designerToken });
      ok('designs list');
    } catch (e) {
      fail('designs list', e.message);
    }

    // Publish design
    if (designId) {
      try {
        await api('POST', `/designs/${designId}/transition`, {
          token: designerToken,
          body: { toStatus: 'PUBLISHED' },
        });
        ok('designs publish');
      } catch (e) {
        fail('designs publish', e.message);
      }
    }

    // Uploads
    let uploadId;
    try {
      const r = await api('POST', '/uploads/presign', {
        token: designerToken,
        body: { mimeType: 'image/png', sizeBytes: 1024, filename: 'test.png' },
      });
      const d = unwrap(r.json);
      uploadId = d?.uploadId || d?.id;
      if (uploadId) {
        await api('POST', `/uploads/${uploadId}/confirm`, { token: designerToken, body: {} });
      }
      ok('uploads presign/confirm', String(uploadId));
    } catch (e) {
      fail('uploads', e.message);
    }

    // Render + AI
    if (designId) {
      try {
        const r = await api('POST', '/render-jobs', {
          token: designerToken,
          // STL is free; an HD PNG needs the hd_export entitlement (paid plan).
          body: { designId, exportFormat: 'STL' },
        });
        ok('render-jobs', JSON.stringify(unwrap(r.json)).slice(0, 80));
      } catch (e) {
        fail('render-jobs', e.message);
      }
      // This run has no AI key (env above): the API refuses honestly, with no stand-in picture.
      try {
        // A success does not throw: that is the failure here. A 503 throws into the check below.
        await api('POST', '/ai/inspiration', {
          token: designerToken,
          body: { designId, prompt: 'classic solitaire' },
        });
        fail('ai/inspiration without a key', 'expected 503 AI_NOT_CONFIGURED, got a success');
      } catch (e) {
        if (e.status === 503 && e.body?.code === 'AI_NOT_CONFIGURED') ok('ai/inspiration without a key', 'refused: AI_NOT_CONFIGURED');
        else fail('ai/inspiration without a key', e.message);
      }
    }

    // Visualization — flag + paywall; the design is composed onto a real photo, so the output differs
    // from the selfie. The photo is a real PNG uploaded as the app uploads it.
    if (designId) {
      try {
        const selfieId = await uploadPng(designerToken, solidPng(96, 72), 'hand.png');
        const r = await api('POST', '/visualization/jobs', {
          token: designerToken,
          body: { designId, inputUploadId: selfieId },
        });
        const job = unwrap(r.json);
        if (!job?.outputUploadId) throw new Error('missing outputUploadId');
        if (job.outputUploadId === job.inputUploadId) {
          throw new Error('visualization echoed input upload');
        }
        ok('visualization overlay', `${job.inputUploadId} -> ${job.outputUploadId}`);
      } catch (e) {
        fail('visualization overlay', e.message);
      }
    }

    // Atelier
    try {
      await api('GET', '/atelier/designs', { token: designerToken });
      ok('atelier/designs');
    } catch (e) {
      fail('atelier/designs', e.message);
    }
    try {
      await api('GET', '/atelier/jewelers', { token: designerToken });
      ok('atelier/jewelers');
    } catch (e) {
      fail('atelier/jewelers', e.message);
    }
    try {
      await api('GET', '/atelier/banners', { token: designerToken });
      ok('atelier/banners');
    } catch (e) {
      fail('atelier/banners', e.message);
    }
    try {
      await api('GET', '/promotions/feed?placement=atelier_banner', { token: designerToken });
      ok('promotions/feed');
    } catch (e) {
      fail('promotions/feed', e.message);
    }

    // Jeweler profile publish path
    let jewelerProfileId;
    try {
      const regions = await api('GET', '/master-data/regions', { token: jewelerToken });
      const regionList = unwrap(regions.json);
      const regionId = (Array.isArray(regionList) ? regionList : regionList?.items || [])[0]?.id;
      await api('PUT', '/jeweler-profiles/draft', {
        token: jewelerToken,
        body: {
          regionId,
          payload: {
            businessName: 'E2E Goldsmith',
            phone: '+972501234567',
            email: 'shop@example.com',
            bio: 'Test workshop',
            latitude: 32.0853,
            longitude: 34.7818,
          },
        },
      });
      await api('POST', '/jeweler-profiles/preview', { token: jewelerToken, body: {} });
      const pub = await api('POST', '/jeweler-profiles/publish', { token: jewelerToken, body: {} });
      let profile = unwrap(pub.json);
      jewelerProfileId = profile?.id;
      if (!jewelerProfileId) {
        profile = unwrap((await api('GET', '/jeweler-profiles/me', { token: jewelerToken })).json);
        jewelerProfileId = profile?.id;
      }
      if (!jewelerProfileId) throw new Error(JSON.stringify(pub.json).slice(0, 400));
      ok('jeweler publish', `${profile?.publishStatus} ${jewelerProfileId}`);
    } catch (e) {
      fail('jeweler publish', e.message);
    }

    // Design request + conversation + quote
    let conversationId;
    let quoteId;
    if (designId && jewelerProfileId) {
      try {
        const req = await api('POST', '/atelier/requests', {
          token: designerToken,
          body: {
            designId,
            mode: 'TARGETED',
            targetJewelerProfileIds: [jewelerProfileId],
            message: 'Please quote',
          },
        });
        const request = unwrap(req.json);
        ok('atelier request', request?.id);

        const conv = await api('POST', '/conversations', {
          token: jewelerToken,
          body: {
            designId,
            participantUserIds: [], // service may resolve from design owner
          },
        }).catch(async () => {
          // fallback: list or create with designer id from me
          const me = unwrap((await api('GET', '/auth/me', { token: designerToken })).json);
          return api('POST', '/conversations', {
            token: jewelerToken,
            body: { designId, participantUserIds: [me.id] },
          });
        });
        conversationId = unwrap(conv.json)?.id;
        ok('conversation', conversationId);

        if (conversationId) {
          const q = await api('POST', '/quotes', {
            token: jewelerToken,
            body: {
              conversationId,
              designId,
              designRequestId: request?.id,
              materialsCost: 100,
              laborCost: 50,
              laborHours: 5,
              etaBusinessDays: 14,
              currency: 'ILS',
              notes: 'E2E quote',
            },
          });
          const quote = unwrap(q.json);
          quoteId = quote?.id;
          ok('quote create', quoteId);

          if (quoteId) {
            // The owner confirms the exact terms shown on the quote card.
            await api('POST', `/quotes/${quoteId}/accept`, {
              token: designerToken,
              body: { expectedTotalPrice: Number(quote.totalPrice), expectedCurrency: quote.currency },
            });
            ok('quote accept');
            const notes = unwrap((await api('GET', '/notifications', { token: designerToken })).json);
            const items = notes?.items || [];
            if (!items.some((n) => n.eventKey === 'quote.accepted')) {
              throw new Error('designer missing quote.accepted notification');
            }
            ok('quote accept notification');
            await new Promise((r) => setTimeout(r, 2500));
            const jewelerNotes = unwrap((await api('GET', '/notifications', { token: jewelerToken })).json);
            const jewelerItems = jewelerNotes?.items || [];
            if (
              !jewelerItems.some(
                (n) => n.eventKey === 'quote.accepted' || n.eventKey === 'handoff.created',
              )
            ) {
              throw new Error('jeweler missing outbox notification');
            }
            ok('outbox jeweler notification');
          }
        }
      } catch (e) {
        fail('request/quote flow', e.message);
      }
    }

    // Subscriptions
    try {
      await api('GET', '/subscriptions/plans', { token: designerToken });
      ok('subscriptions/plans');
    } catch (e) {
      fail('subscriptions/plans', e.message);
    }

    // Phase 3 — verified OAuth, radius geo, persisted jewelry intents
    try {
      const r = await api('POST', '/auth/oauth/google', {
        body: { idToken: 'e2e-fake-google-token' },
        expectStatus: 401,
      });
      if (r.status !== 401) throw new Error(`expected 401 got ${r.status}`);
      ok('phase3 oauth rejects unsigned', `status ${r.status}`);
    } catch (e) {
      fail('phase3 oauth rejects unsigned', e.message);
    }

    try {
      const near = unwrap(
        (
          await api('GET', '/atelier/geo/search?lat=32.08&lng=34.78&radiusKm=10', {
            token: designerToken,
          })
        ).json,
      );
      const nearItems = near?.items || [];
      if (!nearItems.length) throw new Error('expected Tel Aviv jeweler within 10km');
      ok('phase3 geo near', String(nearItems.length));

      const far = unwrap(
        (await api('GET', '/atelier/geo/search?lat=0&lng=0&radiusKm=10', { token: designerToken })).json,
      );
      const farItems = far?.items || [];
      if (farItems.some((item) => item.id === nearItems[0]?.id)) {
        throw new Error('radius filter included a Tel Aviv jeweler at (0,0)');
      }
      ok('phase3 geo far filtered', String(farItems.length));
    } catch (e) {
      fail('phase3 geo search', e.message);
    }

    try {
      if (!quoteId) throw new Error('no accepted quote to pay');
      // Amount and currency come from the accepted quote, never from the client.
      const r = await api('POST', '/jewelry-payments/intents', {
        token: designerToken,
        body: { quoteId },
      });
      const created = unwrap(r.json);
      if (!created?.id) throw new Error('intent not persisted');
      if (created.amount !== 150 || created.currency !== 'ILS') {
        throw new Error(`intent amount ${created.amount} ${created.currency} is not the quote total`);
      }
      const got = unwrap(
        (await api('GET', `/jewelry-payments/intents/${created.id}`, { token: designerToken })).json,
      );
      if (got?.id !== created.id) throw new Error('GET intent mismatch');
      ok('phase3 jewelry pay persisted', created.id);
    } catch (e) {
      fail('phase3 jewelry pay', e.message);
    }

    // Gallery + content
    try {
      await api('GET', '/gallery');
      ok('gallery');
    } catch (e) {
      fail('gallery', e.message);
    }
    try {
      await api('GET', '/content/quote_disclaimer?locale=he');
      ok('content quote_disclaimer');
    } catch (e) {
      fail('content quote_disclaimer', e.message);
    }
  } finally {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(apiProc.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
      } else {
        apiProc.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
    try {
      await pg.stop();
    } catch {
      // ignore
    }
    if (fs.existsSync(DB_DIR)) {
      try {
        fs.rmSync(DB_DIR, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
