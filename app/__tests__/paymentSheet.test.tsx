import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { PaymentSheet } from '../src/components/payments/PaymentSheet'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
// The payment page is a WebView: it draws nothing here; the test drives its props.
jest.mock('react-native-webview', () => {
  const MockWebView = () => null
  return { __esModule: true, default: MockWebView, WebView: MockWebView }
})

const PAGE = 'https://secure.cardcom.solutions/EA/EA5/page-1'
const RETURN = 'https://api.malinovskyjewelry.com/api/v1/payments/cardcom/return?jewelry=jp-1&result=success'

const webView = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => typeof node.props.onShouldStartLoadWithRequest === 'function' && Boolean(node.props.source))[0]

describe('the payment page', () => {
  it('reports the return page once, even when Android reports it twice', async () => {
    const onDone = jest.fn()
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<PaymentSheet url={PAGE} onDone={onDone} />)
    })
    await act(async () => {
      expect(webView(tree).props.onShouldStartLoadWithRequest({ url: RETURN })).toBe(false)
      webView(tree).props.onNavigationStateChange({ url: RETURN })
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('success')
    await act(async () => tree.unmount())
  })

  it('a page opened again after it closed reports again', async () => {
    const onDone = jest.fn()
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<PaymentSheet url={PAGE} onDone={onDone} />)
    })
    await act(async () => webView(tree).props.onShouldStartLoadWithRequest({ url: RETURN }))
    await act(async () => tree.update(<PaymentSheet url={null} onDone={onDone} />))
    await act(async () => tree.update(<PaymentSheet url={PAGE} onDone={onDone} />))
    await act(async () => webView(tree).props.onShouldStartLoadWithRequest({ url: RETURN }))
    expect(onDone).toHaveBeenCalledTimes(2)
    await act(async () => tree.unmount())
  })
})
