import fs from 'fs';
import path from 'path';
import { isCurrentSession } from './session-validity';

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

describe('isCurrentSession', () => {
  it('accepts a token issued under the current session version', () => {
    expect(isCurrentSession({ sv: 3 }, { sessionVersion: 3 })).toBe(true);
  });

  it('refuses a token issued before the sessions were ended', () => {
    expect(isCurrentSession({ sv: 2 }, { sessionVersion: 3 })).toBe(false);
  });

  it('treats tokens from before session versions existed as version 0', () => {
    expect(isCurrentSession({}, { sessionVersion: 0 })).toBe(true);
    expect(isCurrentSession({}, { sessionVersion: 1 })).toBe(false);
  });

  it('every place that verifies an access token itself also checks the session', () => {
    const verifying = sourceFiles(SRC).filter((file) => /verifyAsync<\s*JwtPayload/.test(fs.readFileSync(file, 'utf8')));
    expect(verifying.length).toBeGreaterThan(0);
    const unchecked = verifying
      .filter((file) => !fs.readFileSync(file, 'utf8').includes('isCurrentSession('))
      .map((file) => path.relative(SRC, file));
    expect(unchecked).toEqual([]);
  });
});
