/**
 * Fails when prisma/migrations and prisma/schema.prisma disagree (a hand-written migration that
 * does not match the schema, or a schema change without a migration).
 *
 * Uses SHADOW_DATABASE_URL when set (CI service container); otherwise starts a throwaway embedded
 * PostgreSQL. EMBEDDED_PG_MODULE_DIR may point at an embedded-postgres install on an ASCII path
 * (initdb fails under non-ASCII directories on Windows).
 *
 * --print-sql prints the SQL that would bring the migrations to the schema (to start a new
 * migration) instead of checking.
 */
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PRINT_SQL = process.argv.includes('--print-sql');

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

async function main() {
  let shadowUrl = process.env.SHADOW_DATABASE_URL;
  let pg;
  let dataDir;
  if (!shadowUrl) {
    const fromDir = process.env.EMBEDDED_PG_MODULE_DIR;
    const req = fromDir ? createRequire(path.join(fromDir, 'index.js')) : require;
    const EmbeddedPostgres = req('embedded-postgres').default;
    dataDir = path.join(os.tmpdir(), `malinvosky-shadow-pg-${process.pid}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
    const port = await freePort();
    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => undefined,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('shadow');
    shadowUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/shadow?schema=public`;
  }

  try {
    const prismaCli = require.resolve('prisma/build/index.js', { paths: [ROOT] });
    const result = spawnSync(
      process.execPath,
      [
        prismaCli,
        'migrate',
        'diff',
        '--from-migrations',
        path.join('prisma', 'migrations'),
        '--to-schema-datamodel',
        path.join('prisma', 'schema.prisma'),
        '--shadow-database-url',
        shadowUrl,
        PRINT_SQL ? '--script' : '--exit-code',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    if (PRINT_SQL) {
      // the SQL itself is on stdout
    } else if (result.status === 0) {
      console.log('Migrations match schema.prisma (no drift).');
    } else if (result.status === 2) {
      console.error('DRIFT: migrations do not produce schema.prisma (diff above).');
    }
    return result.status ?? 1;
  } finally {
    if (pg) {
      await pg.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }
}

// Exit explicitly: embedded-postgres installs an exit hook that would otherwise reset the code to 0.
main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
