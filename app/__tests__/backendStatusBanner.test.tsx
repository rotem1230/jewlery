import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { getHealth } from '../src/lib/api'
import { BackendStatusBanner } from '../src/components/BackendStatusBanner'

// NativeWind's runtime ships untranspiled JSX; plain React renders these components the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('../src/lib/api', () => ({
  API_BASE_URL: 'https://api.example.test/api/v1',
  getHealth: jest.fn(async () => ({ status: 'ok' })),
}))

declare const global: { __DEV__: boolean }

describe('backend status banner', () => {
  const dev = global.__DEV__

  afterEach(() => {
    global.__DEV__ = dev
    ;(getHealth as jest.Mock).mockClear()
  })

  async function render(): Promise<ReactTestRenderer> {
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<BackendStatusBanner />)
    })
    return tree
  }

  it('never shows (nor pings the API) in a release build', async () => {
    global.__DEV__ = false
    const tree = await render()
    expect(tree.toJSON()).toBeNull()
    expect(getHealth).not.toHaveBeenCalled()
    await act(async () => tree.unmount())
  })

  it('shows the connection to developers', async () => {
    global.__DEV__ = true
    const tree = await render()
    expect(tree.root.findByProps({ testID: 'backend-status' })).toBeTruthy()
    expect(getHealth).toHaveBeenCalledTimes(1)
    await act(async () => tree.unmount())
  })
})
