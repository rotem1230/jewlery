import { ActivityIndicator, Image, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { setAuthSessionBridge } from '../src/lib/api'
import { getTryOnOverlay } from '../src/api/visualization'
import { TryOnPlacement } from '../src/components/studio/TryOnPlacement'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

/** The picture's bytes as a test blob carries them (already base64). */
type TestBlob = { type: string; base64: string }

/** React Native's FileReader, as far as the overlay needs it (reads asynchronously). */
class TestFileReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(blob: TestBlob) {
    setTimeout(() => {
      this.result = `data:${blob.type};base64,${blob.base64}`
      this.onload?.()
    }, 0)
  }
}

const PNG_BASE64 = 'iVBORwECAw=='

function picture(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: async (): Promise<TestBlob> => ({ type: 'image/png', base64: PNG_BASE64 }),
    json: async () => ({ success: true, data: { tokens: { accessToken: 'new-access', refreshToken: 'refresh-2' } } }),
    text: async () => '{"success":false}',
  } as unknown as Response
}

describe('try-on overlay: loaded with the session, not by the image view', () => {
  const calls: Array<{ url: string; auth?: string }> = []
  let token = 'access-1'

  beforeEach(() => {
    calls.length = 0
    token = 'access-1'
    ;(globalThis as { FileReader?: unknown }).FileReader = TestFileReader
    setAuthSessionBridge({
      getAccessToken: () => token,
      getRefreshToken: () => 'refresh-1',
      applyTokens: (tokens) => {
        token = tokens.accessToken
      },
      onAuthLost: jest.fn(),
    })
  })

  it('sends the bearer token (an <Image> on Android drops source headers) and returns a data URI', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), auth: (init?.headers as Record<string, string>)?.Authorization })
      return picture(200)
    }) as unknown as typeof fetch
    const uri = await getTryOnOverlay('d-1', 3)
    expect(calls).toHaveLength(1)
    expect(calls[0].url.endsWith('/visualization/designs/d-1/overlay?v=3')).toBe(true)
    expect(calls[0].auth).toBe('Bearer access-1')
    expect(uri).toBe(`data:image/png;base64,${PNG_BASE64}`)
  })

  it('an expired session is refreshed and the overlay asked for again', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization })
      if (url.endsWith('/auth/refresh')) return picture(201)
      return picture(token === 'access-1' ? 401 : 200)
    }) as unknown as typeof fetch
    await expect(getTryOnOverlay('d-1', 4)).resolves.toMatch(/^data:image\/png;base64,/)
    expect(calls.map((c) => c.auth).filter(Boolean)).toEqual(['Bearer access-1', 'Bearer new-access'])
  })
})

describe('try-on placement screen', () => {
  const props = { visible: true, photoUri: 'file:///photo.jpg', onConfirm: jest.fn(), onCancel: jest.fn() }

  async function render(loadOverlay: (signal: AbortSignal) => Promise<string>) {
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<TryOnPlacement {...props} loadOverlay={loadOverlay} />)
    })
    return tree
  }

  it('places the overlay it loaded once the photo is measured', async () => {
    const tree = await render(async () => 'data:image/png;base64,AAAA')
    await act(async () => {
      tree.root.findAllByType(Image)[0].props.onLoad({ nativeEvent: { source: { width: 400, height: 300 } } })
      tree.root.findByProps({ testID: 'try-on-frame' }).props.onLayout({ nativeEvent: { layout: { width: 400, height: 600 } } })
    })
    const overlay = tree.root.findAllByType(Image)[1]
    expect(overlay.props.source).toEqual({ uri: 'data:image/png;base64,AAAA' })
    act(() => tree.unmount())
  })

  it('a failed overlay says so and can be tried again, instead of spinning forever', async () => {
    let attempts = 0
    const tree = await render(async () => {
      attempts++
      if (attempts === 1) throw new Error('offline')
      return 'data:image/png;base64,BBBB'
    })
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0)
    const texts = () => tree.root.findAllByType(Text).map((n) => n.props.children)
    expect(texts()).toContain('לא הצלחנו להציג את התכשיט. בדקו את החיבור ונסו שוב.')
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'נסו שוב' }).props.onPress()
    })
    expect(attempts).toBe(2)
    expect(texts()).not.toContain('לא הצלחנו להציג את התכשיט. בדקו את החיבור ונסו שוב.')
    act(() => tree.unmount())
  })

  it('stops loading the overlay when the screen closes', async () => {
    let seen: AbortSignal | null = null
    const tree = await render((signal) => {
      seen = signal
      return new Promise<string>(() => undefined)
    })
    expect(seen!.aborted).toBe(false)
    act(() => tree.unmount())
    expect(seen!.aborted).toBe(true)
  })
})
