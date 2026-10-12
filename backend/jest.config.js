/**
 * Two suites:
 *  - unit: pure logic next to the code (src/**\/*.spec.ts), no database.
 *  - e2e:  the real Nest app (same bootstrap as production via configureApp) against a real
 *          PostgreSQL (TEST_DATABASE_URL, or an embedded server started in global setup).
 *          Every security fix ships a regression test in test/**\/*.e2e-spec.ts.
 */
// Type checking is a separate gate (`npm run typecheck`); jest transpiles per file for speed.
const tsJest = ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }];

module.exports = {
  testTimeout: 60_000,
  projects: [
    {
      displayName: 'unit',
      rootDir: __dirname,
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
      moduleFileExtensions: ['ts', 'js', 'json'],
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/test/setup/unit-env.ts'],
    },
    {
      displayName: 'e2e',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
      moduleFileExtensions: ['ts', 'js', 'json'],
      testEnvironment: 'node',
      globalSetup: '<rootDir>/test/setup/global-setup.cjs',
      globalTeardown: '<rootDir>/test/setup/global-teardown.cjs',
      setupFiles: ['<rootDir>/test/setup/unit-env.ts', '<rootDir>/test/setup/test-env.ts'],
    },
  ],
};
