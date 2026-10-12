import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('row locks', () => {
  it('every per-account lock goes through lockUser (FOR NO KEY UPDATE), never a raw FOR UPDATE on users', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => path.basename(file) !== 'row-locks.ts')
      .filter((file) => /FROM\s+"users"[^;`]*?FOR\s+(?:NO\s+KEY\s+)?UPDATE/s.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
