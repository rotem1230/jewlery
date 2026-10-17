import { configuration } from '../../src/config/configuration';
import { validateEnv } from '../../src/config/env.validation';

/**
 * STORAGE_DRIVER chooses where uploaded and generated files are kept. Production defaults to the
 * database (hosts without a persistent disk lose local files on every deploy); everything else
 * keeps today's local-disk behaviour unless told otherwise.
 */
describe('STORAGE_DRIVER', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it.each([
    ['production', undefined, 'database'],
    ['production', '', 'database'],
    ['production', 'local', 'local'],
    ['development', undefined, 'local'],
    ['test', undefined, 'local'],
    ['development', 'database', 'database'],
  ])('NODE_ENV=%s with STORAGE_DRIVER=%s uses %s', (nodeEnv, driver, expected) => {
    process.env.NODE_ENV = nodeEnv;
    if (driver === undefined) {
      delete process.env.STORAGE_DRIVER;
    } else {
      process.env.STORAGE_DRIVER = driver;
    }
    expect(configuration().storage.driver).toBe(expected);
  });

  const baseEnv = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://localhost:5432/dev' };

  it.each(['database', 'local', '', undefined])('accepts STORAGE_DRIVER=%s', (driver) => {
    expect(() => validateEnv({ ...baseEnv, STORAGE_DRIVER: driver })).not.toThrow();
  });

  it.each(['disk', 's3', 'DATABASE'])('refuses an unknown STORAGE_DRIVER=%s', (driver) => {
    expect(() => validateEnv({ ...baseEnv, STORAGE_DRIVER: driver })).toThrow(/STORAGE_DRIVER/);
  });
});
