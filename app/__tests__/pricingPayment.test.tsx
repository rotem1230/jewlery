import { Alert, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import {
  getCheckout,
  getMySubscription,
  listPlans,
  startCheckout,
  subscribeToPlan,
} from '../src/api/subscriptions'
import { ApiError } from '../src/lib/api'
import { t } from '../src/i18n'
import { Button } from '../src/components/ui/Button'
import { PricingScreen } from '../src/screens/designer/PricingScreen'
import type { PlanCatalog } from '../src/types/api'

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
jest.mock('@react-navigation/native', () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() }
  return { useNavigation: () => navigation }
})
jest.mock('../src/api/subscriptions', () => ({
  listPlans: jest.fn(),
  getMySubscription: jest.fn(),
  subscribeToPlan: jest.fn(),
  cancelSubscription: jest.fn(),
  startCheckout: jest.fn(),
  getCheckout: jest.fn(),
}))
jest.mock('../src/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ auth: { accessToken: 'token-1', user: { id: 'designer-1', activeRole: 'DESIGNER' } } }),
}))

jest.setTimeout(60_000)

const plan = (overrides: Partial<PlanCatalog>): PlanCatalog => ({
  id: overrides.code ?? 'p',
  code: 'DESIGNER_PREMIUM_QUARTERLY',
  role: 'DESIGNER',
  nameHe: 'מעצב/ת - פרימיום רבעוני',
  nameEn: 'Designer Premium Quarterly',
  billingCycle: 'QUARTERLY',
  price: '45',
  currency: 'ILS',
  leadQuota: 0,
  extraLeadPrice: null,
  trialDays: 14,
  inclusions: { bullets: [] },
  sortOrder: 2,
  entitlements: [],
  ...overrides,
})

const PLANS = [plan({ code: 'DESIGNER_FREE', price: '0', trialDays: 0, sortOrder: 1 }), plan({})]
const RETURN = 'https://api.malinovskyjewelry.com/api/v1/payments/cardcom/return?checkout=chk-1'
const refused = (status: number, code: string) => new ApiError(status, '/subscriptions/subscribe', JSON.stringify({ code, message: 'x' }))

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(<PricingScreen />)
  })
  return tree
}

/** The plan cards' buttons, in card order (the free plan, then the paid plan). */
function planButtons(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Button).slice(0, PLANS.length)
}

/** Presses the button of the paid plan's card. */
async function pressPaidPlan(tree: ReactTestRenderer) {
  await act(async () => {
    planButtons(tree)[1].props.onPress()
  })
}

function webView(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => typeof node.props.onShouldStartLoadWithRequest === 'function' && Boolean(node.props.source))[0]
}

let alerts: string[]

beforeEach(() => {
  jest.clearAllMocks()
  alerts = []
  jest.spyOn(Alert, 'alert').mockImplementation((_title, message) => {
    alerts.push(String(message))
  })
  ;(listPlans as jest.Mock).mockResolvedValue(PLANS)
  ;(startCheckout as jest.Mock).mockResolvedValue({
    id: 'chk-1',
    planCode: 'DESIGNER_PREMIUM_QUARTERLY',
    amount: 45,
    currency: 'ILS',
    status: 'OPEN',
    provider: 'cardcom',
    paymentUrl: 'https://secure.cardcom.solutions/EA/EA5/abc',
  })
})

describe('paying for a plan by card (Cardcom) inside the app', () => {
  it('on a trial, the plan offers payment; the Cardcom page opens, closes on the return page, and the plan starts once confirmed', async () => {
    ;(getMySubscription as jest.Mock).mockResolvedValue({ id: 's1', status: 'TRIALING', plan: PLANS[1] })
    ;(getCheckout as jest.Mock).mockResolvedValueOnce({ id: 'chk-1', status: 'COMPLETED' })
    const tree = await open()
    expect(tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))).toContain(t('pricingPay'))

    await pressPaidPlan(tree)
    expect(startCheckout).toHaveBeenCalledWith('DESIGNER_PREMIUM_QUARTERLY')
    const page = webView(tree)
    expect(page.props.source).toEqual({ uri: 'https://secure.cardcom.solutions/EA/EA5/abc' })
    // Cardcom's own pages (and 3-D Secure) load; the return page closes the sheet instead.
    expect(page.props.onShouldStartLoadWithRequest({ url: 'https://secure.cardcom.solutions/EA/EA5/abc/3ds' })).toBe(true)
    let allowed = true
    await act(async () => {
      allowed = page.props.onShouldStartLoadWithRequest({ url: `${RETURN}&result=success` })
    })
    expect(allowed).toBe(false)
    expect(getCheckout).toHaveBeenCalledWith('chk-1')
    expect(alerts).toContain(t('paymentDone'))
    expect(webView(tree)).toBeUndefined()
    await act(async () => tree.unmount())
  })

  it('without a trial left, choosing the plan goes straight to payment', async () => {
    ;(getMySubscription as jest.Mock).mockResolvedValue(null)
    ;(subscribeToPlan as jest.Mock).mockRejectedValue(refused(402, 'PAYMENT_REQUIRED'))
    const tree = await open()
    await pressPaidPlan(tree)
    expect(subscribeToPlan).toHaveBeenCalledWith('DESIGNER_PREMIUM_QUARTERLY')
    expect(startCheckout).toHaveBeenCalledWith('DESIGNER_PREMIUM_QUARTERLY')
    expect(webView(tree)).toBeDefined()
    await act(async () => tree.unmount())
  })

  it('a failed or abandoned payment says nothing was charged and checks nothing', async () => {
    ;(getMySubscription as jest.Mock).mockResolvedValue({ id: 's1', status: 'TRIALING', plan: PLANS[1] })
    const tree = await open()
    await pressPaidPlan(tree)
    await act(async () => {
      webView(tree).props.onShouldStartLoadWithRequest({ url: `${RETURN}&result=failed` })
    })
    expect(getCheckout).not.toHaveBeenCalled()
    expect(alerts).toContain(t('paymentNotCompleted'))
    await act(async () => tree.unmount())
  })

  it('when the payment cannot start, it says payment is unavailable and opens nothing', async () => {
    ;(getMySubscription as jest.Mock).mockResolvedValue({ id: 's1', status: 'TRIALING', plan: PLANS[1] })
    ;(startCheckout as jest.Mock).mockRejectedValue(
      new ApiError(503, '/subscriptions/checkout', JSON.stringify({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'x' })),
    )
    const tree = await open()
    await pressPaidPlan(tree)
    expect(alerts).toContain('התשלום אינו זמין כרגע. נסו שוב בעוד רגע.')
    expect(webView(tree)).toBeUndefined()
    await act(async () => tree.unmount())
  })

  it('on a paid plan, other plans are not offered (cancel first)', async () => {
    ;(getMySubscription as jest.Mock).mockResolvedValue({ id: 's1', status: 'ACTIVE', plan: PLANS[1] })
    const tree = await open()
    expect(planButtons(tree).map((button) => button.props.disabled)).toEqual([true, true])
    await act(async () => tree.unmount())
  })
})
