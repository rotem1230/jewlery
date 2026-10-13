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
}
