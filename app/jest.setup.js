/* eslint-env jest */
// Native modules the app imports, replaced by their published in-memory Jest mocks.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
)
