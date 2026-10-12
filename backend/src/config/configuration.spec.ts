import { configuration } from './configuration';

describe('configuration', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('has no default CORS origins in production (localhost defaults are for development)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;
    expect(configuration().corsOrigins).toEqual([]);
  });

  it('keeps the local web origins by default in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGINS;
    expect(configuration().corsOrigins).toEqual(['http://localhost:3000', 'http://localhost:8081']);
  });
});
