module.exports = {
  preset: '@react-native/jest-preset',
  // The preset only transforms react-native / @react-native packages; these ship ESM too.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|immer)/)',
  ],
  // NativeWind's global stylesheet is a build-time asset.
  moduleNameMapper: {
    '\.css$': '<rootDir>/__mocks__/styleMock.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
  // A suite's first render loads (and on a cold cache, transforms) React Native's modules inside the
  // test. On a loaded machine that alone passed jest's 5 s default (backendStatusBanner,
  // paymentSheet and tryOnOverlay timed out while an emulator ran, and pass in under 0.4 s once loaded).
  testTimeout: 60000,
}
