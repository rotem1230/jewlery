/**
 * e2e global setup: a real PostgreSQL for the whole run.
 *  - TEST_DATABASE_URL set (CI service container) -> use it as-is.
 *  - otherwise start an embedded PostgreSQL in backend/.tmp-test-pg (removed on teardown).
 * Then apply the real migrations and the reference seed, exactly like a deployment would.
 */
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { execFileSync } = require('child_process');

/**
 * PostgreSQL's initdb fails when its own install path contains non-ASCII characters (e.g. a
 * checkout under a Hebrew folder on Windows). EMBEDDED_PG_MODULE_DIR may point at a directory
 * whose node_modules holds embedded-postgres installed on an ASCII path.
 */
function loadEmbeddedPostgres() {
  const fromDir = process.env.EMBEDDED_PG_MODULE_DIR;
  const req = fromDir ? createRequire(path.join(fromDir, 'index.js')) : require;
  return req('embedded-postgres').default;
}

const ROOT = path.join(__dirname, '..', '..');
// initdb cannot handle non-ASCII data-dir paths on Windows, so the throwaway cluster lives in the
// OS temp dir rather than next to the sources.
const TMP_DIR = process.env.TEST_PG_DIR || path.join(os.tmpdir(), `malinvosky-test-pg-${process.pid}`);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

module.exports = async function globalSetup() {
  let databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    const EmbeddedPostgres = loadEmbeddedPostgres();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const port = await freePort();
    const pg = new EmbeddedPostgres({
      databaseDir: path.join(TMP_DIR, 'data'),
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => undefined,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('malinvosky_test');
    globalThis.__MALINVOSKY_EMBEDDED_PG__ = pg;
    globalThis.__MALINVOSKY_EMBEDDED_PG_DIR__ = TMP_DIR;
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/malinvosky_test?schema=public`;
  }

  process.env.DATABASE_URL = databaseUrl;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    REDIS_URL: '',
    JOBS_ENABLED: 'false',
  };

  const prismaCli = require.resolve('prisma/build/index.js', { paths: [ROOT] });
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: ROOT, env, stdio: 'pipe' });

  execFileSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', path.join('prisma', 'seed.ts')],
    {
      cwd: ROOT,
      env: { ...env, TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'CommonJS' }) },
      stdio: 'pipe',
    },
  );
};
