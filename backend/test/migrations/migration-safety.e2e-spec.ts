import fs from 'fs';
import path from 'path';
import { migrationNames } from '../utils/migration-db';

const MIGRATIONS = path.join(__dirname, '..', '..', 'prisma', 'migrations');
/** Migrations written for the production hardening; older ones were already deployed as they are. */
const FIRST_GUARDED = '20261012100000';

/**
 * A migration that waits behind a long-running transaction for its table lock also blocks every
 * query queued behind it: the whole API stalls. A lock timeout makes the deploy fail fast instead.
 */
describe('migration safety', () => {
  it.each(migrationNames().filter((name) => name >= FIRST_GUARDED))('%s sets a lock timeout before taking locks', (name) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8');
    const statements = sql
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('--'));
    // LOCAL: the migration runs as one transaction; the setting must not outlive it on a pooled session.
    expect(statements[0]).toMatch(/^SET LOCAL lock_timeout = '\d+s';$/);
  });
});
