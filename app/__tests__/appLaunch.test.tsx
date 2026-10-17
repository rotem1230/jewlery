import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { warmUpBackend } from '../src/lib/api'
import App from '../App'

// NativeWind's runtime ships untranspiled JSX; plain React renders the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('../src/lib/api', () => ({ warmUpBackend: jest.fn(async () => undefined) }))
// The app shell only: providers and navigation render their children.
jest.mock('../src/store/Provider', () => ({ StoreProvider: ({ children }: { children: unknown }) => children }))
jest.mock('../src/navigation/RootNavigator', () => ({ RootNavigator: () => null }))
jest.mock('../src/navigation/navigationRef', () => ({ navigationRef: { current: null } }))
jest.mock('@react-navigation/native', () => ({ NavigationContainer: ({ children }: { children: unknown }) => children }))
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: unknown }) => children,
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}))

describe('app launch', () => {
  it('wakes the backend once, without waiting for it', async () => {
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<App />)
    })
    expect(warmUpBackend).toHaveBeenCalledTimes(1)
    await act(async () => {
      tree.update(<App />)
    })
    expect(warmUpBackend).toHaveBeenCalledTimes(1)
    await act(async () => {
      tree.unmount()
    })
  })
})
