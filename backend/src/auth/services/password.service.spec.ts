import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../cms/app-config.service';
import { PasswordService } from './password.service';

/** Hashes written by bcrypt 5.1.1 (before the bcrypt 6 upgrade), as stored in users.passwordHash. */
const STORED_BEFORE_UPGRADE = [
  { password: 'Passw0rd!legacy', hash: '$2b$12$uMDzuoKDKBRVUpsiqAJAZ.7ihSNDBeHLvAPXe4d4VRIKPPwiT5zDu' },
  { password: 'שלום-עולם-123', hash: '$2b$10$BNNmoGYGVCEEEgEqINtfrOvPYoeHpWwbgQgs1mfIc/6HwBc0Kz/pW' },
  { password: 'x'.repeat(72), hash: '$2b$10$jo3zSep6UZVGbX38EnKk9OLpFW0AcawoZyI4Yc8uEiVE2GjA.S..2' },
];

function passwords(rounds = 4): PasswordService {
  const config = { get: (key: string, fallback?: unknown) => (key === 'auth.bcryptRounds' ? rounds : fallback) };
  return new PasswordService(config as unknown as ConfigService, {} as AppConfigService);
}

describe('PasswordService hashing', () => {
  it('accepts the password hashes stored before the library upgrade', async () => {
    const service = passwords();
    for (const { password, hash } of STORED_BEFORE_UPGRADE) {
      await expect(service.compare(password, hash)).resolves.toBe(true);
    }
  });

  it('refuses a wrong password against a stored hash', async () => {
    const service = passwords();
    await expect(service.compare('Passw0rd!legacY', STORED_BEFORE_UPGRADE[0].hash)).resolves.toBe(false);
    await expect(service.compare(`${'x'.repeat(71)}y`, STORED_BEFORE_UPGRADE[2].hash)).resolves.toBe(false);
  });

  it('writes standard $2b$ hashes at the configured cost, which verify', async () => {
    const service = passwords(5);
    const hash = await service.hash('Passw0rd!new');
    expect(hash).toMatch(/^\$2b\$05\$[./A-Za-z0-9]{53}$/);
    await expect(service.compare('Passw0rd!new', hash)).resolves.toBe(true);
    await expect(service.compare('Passw0rd!old', hash)).resolves.toBe(false);
  });
});
