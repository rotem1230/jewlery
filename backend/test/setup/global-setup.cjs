/**
 * e2e global setup: a real PostgreSQL for the whole run.
 *  - TEST_DATABASE_URL set (CI service container) -> use it as-is.
 *  - otherwise start an embedded PostgreSQL in the OS temp dir (removed on teardown).
 * The database is pinned to a non-UTC time zone (see TEST_DB_TIMEZONE), then the real migrations
 * and the reference seed are applied, exactly like a deployment would.
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
// Prisma keeps DateTime columns as UTC wall-clock time. CI databases usually run in UTC, where raw
// SQL that lets PostgreSQL convert a date through the session time zone looks correct. A zone with
// a real offset makes that class of bug fail the suite instead of shipping.
const TEST_DB_TIMEZONE = process.env.TEST_DB_TIMEZONE || 'Asia/Jerusalem';

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
      // No I/O worker processes (PostgreSQL 18): on Windows they can outlive a stopped server
      // and keep shared memory, so the next cluster fails to start.
      postgresFlags: ['-c', 'io_method=sync'],
      // Server output is kept for diagnosing failed runs (removed with the cluster on teardown).
      onLog: (message) => fs.appendFileSync(path.join(TMP_DIR, 'postgres.log'), `${String(message)}\n`),
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('malinvosky_test');
    globalThis.__MALINVOSKY_EMBEDDED_PG__ = pg;
    globalThis.__MALINVOSKY_EMBEDDED_PG_DIR__ = TMP_DIR;
    // Every PostgreSQL connection is a new process (slow to start on Windows under load): allow a
    // generous connect timeout and keep the pool bounded, above the tests' peak concurrency.
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/malinvosky_test?schema=public&connection_limit=24&connect_timeout=30&pool_timeout=30`;
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
  if (!/^[A-Za-z0-9_+\-/]+$/.test(TEST_DB_TIMEZONE)) {
    throw new Error(`TEST_DB_TIMEZONE is not a time zone name: ${TEST_DB_TIMEZONE}`);
  }
  const pinTimezone = `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), '${TEST_DB_TIMEZONE}'); END $$;`;
  execFileSync(process.execPath, [prismaCli, 'db', 'execute', '--url', databaseUrl, '--stdin'], {
    cwd: ROOT,
    env,
    input: pinTimezone,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
