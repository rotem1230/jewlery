import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS = path.join(ROOT, 'prisma', 'migrations');

export function migrationNames(): string[] {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((name) => fs.statSync(path.join(MIGRATIONS, name)).isDirectory())
    .sort();
}

export type ScratchDatabase = {
  /** Connection string of the scratch database. */
  url: string;
  /** Raw SQL only: the schema at an older migration does not match the generated client. */
  sql: PrismaClient;
  /** Applies every migration up to and including `lastMigration`, exactly like a deployment. */
  migrateTo: (lastMigration: string) => void;
  drop: () => Promise<void>;
};

/**
 * A fresh database on the e2e PostgreSQL server for testing data migrations: migrate to the
 * state before a migration, insert the data production may hold, then apply the migration.
 */
export async function scratchDatabase(name: string): Promise<ScratchDatabase> {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`invalid scratch database name: ${name}`);
  }
  const serverUrl = new URL(process.env.DATABASE_URL as string);
  const admin = new PrismaClient({ datasourceUrl: serverUrl.toString() });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  // Same non-UTC zone as the main test database, so time-zone mistakes in migrations show up.
  const timezone = process.env.TEST_DB_TIMEZONE || 'Asia/Jerusalem';
  if (!/^[A-Za-z0-9_+\-/]+$/.test(timezone)) {
    throw new Error(`invalid TEST_DB_TIMEZONE: ${timezone}`);
  }
  await admin.$executeRawUnsafe(`ALTER DATABASE "${name}" SET timezone TO '${timezone}'`);

  const url = new URL(serverUrl.toString());
  url.pathname = `/${name}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'malinvosky-migrations-'));
  fs.copyFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), path.join(dir, 'schema.prisma'));
  fs.mkdirSync(path.join(dir, 'migrations'));
  fs.copyFileSync(path.join(MIGRATIONS, 'migration_lock.toml'), path.join(dir, 'migrations', 'migration_lock.toml'));
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [ROOT] });
  const sql = new PrismaClient({ datasourceUrl: url.toString() });

  return {
    url: url.toString(),
    sql,
    migrateTo(lastMigration) {
      if (!migrationNames().includes(lastMigration)) {
        throw new Error(`unknown migration ${lastMigration}`);
      }
      for (const migration of migrationNames().filter((m) => m <= lastMigration)) {
        const target = path.join(dir, 'migrations', migration);
        if (!fs.existsSync(target)) {
          fs.cpSync(path.join(MIGRATIONS, migration), target, { recursive: true });
        }
      }
      execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', path.join(dir, 'schema.prisma')], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
      });
    },
    async drop() {
      await sql.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
