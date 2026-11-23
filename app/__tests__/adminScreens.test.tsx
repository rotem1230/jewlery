import { Alert, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import {
  listAdminPlans,
  listJewelryPayments,
  listPayouts,
  listPlanFeatures,
  listPlanPayments,
  markPayoutPaid,
  refundPlanPayment,
  updateAdminPlan,
  type AdminPlan,
} from '../src/api/admin'
import { Button } from '../src/components/ui/Button'
import { Field } from '../src/components/ui/Field'
import { t } from '../src/i18n'
import { AdminJewelryScreen } from '../src/screens/admin/AdminJewelryScreen'
import { AdminPaymentsScreen } from '../src/screens/admin/AdminPaymentsScreen'
import { AdminPlanEditScreen } from '../src/screens/admin/AdminPlanEditScreen'
import { AdminPlansScreen } from '../src/screens/admin/AdminPlansScreen'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
const mockRoute = { params: { code: 'DESIGNER_PREMIUM_QUARTERLY' } as Record<string, unknown> }
jest.mock('@react-navigation/native', () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() }
  return { useNavigation: () => navigation, useRoute: () => mockRoute, useFocusEffect: () => undefined }
})
jest.mock('../src/api/admin', () => ({
  listAdminPlans: jest.fn(),
  listPlanFeatures: jest.fn(),
  updateAdminPlan: jest.fn(),
  createAdminPlan: jest.fn(),
  listPlanPayments: jest.fn(),
  refundPlanPayment: jest.fn(),
  resolveRefund: jest.fn(),
  listJewelryPayments: jest.fn(),
  refundJewelryPayment: jest.fn(),
  listPayouts: jest.fn(),
  markPayoutPaid: jest.fn(),
}))

jest.setTimeout(60_000)

const PLAN: AdminPlan = {
  id: 'p1',
  code: 'DESIGNER_PREMIUM_QUARTERLY',
  role: 'DESIGNER',
  nameHe: 'מעצב/ת - פרימיום רבעוני',
  nameEn: 'Designer Premium Quarterly',
  billingCycle: 'QUARTERLY',
  price: 45,
  currency: 'ILS',
  trialDays: 14,
  leadQuota: 0,
  extraLeadPrice: null,
  sortOrder: 2,
  isActive: true,
  bulletsHe: [],
  bulletsEn: [],
  features: ['hd_export'],
  aiRenders: 150,
  unlimited: false,
  liveSubscribers: 2,
}

async function open(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(element)
  })
  return tree
}

const fieldByLabel = (tree: ReactTestRenderer, label: string) => tree.root.findAll((node) => node.type === Field && node.props.label === label)[0]
const buttonByText = (tree: ReactTestRenderer, text: string) => tree.root.findAll((node) => node.type === Button && node.props.children === text)[0]
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))

let alerts: string[]

beforeEach(() => {
  jest.clearAllMocks()
  alerts = []
  jest.spyOn(Alert, 'alert').mockImplementation((_title, message) => {
    alerts.push(String(message))
  })
})

describe('the plans list (notes of 23.11: old jeweler plans looked like current ones)', () => {
  const jeweler = (code: string, nameHe: string, price: number, leadQuota: number, isActive: boolean, liveSubscribers = 0): AdminPlan => ({
    ...PLAN,
    id: code,
    code,
    role: 'JEWELER',
    nameHe,
    price,
    leadQuota,
    isActive,
    liveSubscribers,
    aiRenders: null,
  })

  it('shows the plans on offer apart from the withdrawn ones, which say they are not sold', async () => {
    ;(listAdminPlans as jest.Mock).mockResolvedValue([
      jeweler('JEWELER_BASIC_QUARTERLY', 'צורף/ת - בסיסית', 390, 10, true),
      jeweler('JEWELER_PROFESSIONAL', 'צורף/ת - מקצועית', 525, 15, true),
      jeweler('JEWELER_ACTIVE', 'צורף/ת - אקטיבי', 199, 15, false, 1),
      jeweler('JEWELER_BASIC', 'צורף/ת - בסיסי', 0, 3, false),
    ])
    const tree = await open(<AdminPlansScreen />)
    // Only the plans on offer at first.
    expect(texts(tree)).toContain('צורף/ת - מקצועית')
    expect(texts(tree)).not.toContain('צורף/ת - אקטיבי')
    expect(texts(tree)).not.toContain('צורף/ת - בסיסי')
    // The withdrawn ones on request, under their own title (they stay editable, e.g. to offer again).
    await act(async () => buttonByText(tree, t('admShowWithdrawn').replace('{{count}}', '2')).props.onPress())
    const lines = texts(tree)
    const withdrawnTitle = lines.indexOf(t('admWithdrawnPlans'))
    expect(withdrawnTitle).toBeGreaterThan(lines.indexOf('צורף/ת - מקצועית'))
    expect(lines.indexOf('צורף/ת - אקטיבי')).toBeGreaterThan(withdrawnTitle)
    expect(lines.indexOf('צורף/ת - בסיסי')).toBeGreaterThan(withdrawnTitle)
  })
})

describe('editing a plan', () => {
  beforeEach(() => {
    ;(listAdminPlans as jest.Mock).mockResolvedValue([PLAN])
    ;(listPlanFeatures as jest.Mock).mockResolvedValue([{ key: 'hd_export', description: 'HD export' }])
    ;(updateAdminPlan as jest.Mock).mockResolvedValue(PLAN)
  })

  it('saves the new price and AI quota of the plan', async () => {
    const tree = await open(<AdminPlanEditScreen />)
    await act(async () => fieldByLabel(tree, t('admFieldPrice')).props.onChangeText('49.90'))
    await act(async () => fieldByLabel(tree, t('admFieldAi')).props.onChangeText('200'))
    await act(async () => buttonByText(tree, t('admSave')).props.onPress())
    expect(updateAdminPlan).toHaveBeenCalledWith('DESIGNER_PREMIUM_QUARTERLY', expect.objectContaining({ price: 49.9, aiRenders: 200, billingCycle: 'QUARTERLY' }))
    expect(alerts).toContain(t('admSaved'))
    await act(async () => tree.unmount())
  })

  it('an invalid price is explained and nothing is saved', async () => {
    const tree = await open(<AdminPlanEditScreen />)
    await act(async () => fieldByLabel(tree, t('admFieldPrice')).props.onChangeText('-1'))
    await act(async () => buttonByText(tree, t('admSave')).props.onPress())
    expect(updateAdminPlan).not.toHaveBeenCalled()
    expect(fieldByLabel(tree, t('admFieldPrice')).props.error).toBeTruthy()
    await act(async () => tree.unmount())
  })
})

describe('refunding a plan payment', () => {
  it('sends the refund once per request id, with the reason and whether the plan ends', async () => {
    ;(listPlanPayments as jest.Mock).mockResolvedValue([
      {
        id: 'inv-1',
        paidAt: '2026-10-19T10:00:00.000Z',
        amount: 45,
        currency: 'ILS',
        provider: 'cardcom',
        user: { id: 'u1', email: 'dana@example.com', name: 'דנה' },
        plan: { code: 'DESIGNER_PREMIUM_QUARTERLY', nameHe: 'פרימיום רבעוני' },
        refunded: 0,
        refundable: 45,
        refunds: [],
      },
    ])
    ;(refundPlanPayment as jest.Mock).mockResolvedValue({ id: 'r1', status: 'SUCCEEDED', amount: 20, currency: 'ILS', reason: 'פיצוי', failureReason: null, createdAt: '' })
    const tree = await open(<AdminPaymentsScreen />)
    await act(async () => buttonByText(tree, t('admRefund')).props.onPress())
    await act(async () => fieldByLabel(tree, t('admRefundAmount')).props.onChangeText('20'))
    await act(async () => fieldByLabel(tree, t('admRefundReason')).props.onChangeText('פיצוי'))
    const send = buttonByText(tree, t('admRefundSend'))
    await act(async () => {
      // A double tap: both presses carry the same request id.
      send.props.onPress()
      send.props.onPress()
    })
    const calls = (refundPlanPayment as jest.Mock).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0]).toEqual(['inv-1', { amount: 20, reason: 'פיצוי', endSubscription: false, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) }])
    expect(new Set(calls.map((call) => call[1].requestId)).size).toBe(1)
    await act(async () => tree.unmount())
  })

  it('more than is left is refused before asking the server', async () => {
    ;(listPlanPayments as jest.Mock).mockResolvedValue([
      { id: 'inv-2', paidAt: '2026-10-19T10:00:00.000Z', amount: 45, currency: 'ILS', provider: 'cardcom', user: { id: 'u1', email: 'a@b.c', name: null }, plan: { code: 'X', nameHe: 'X' }, refunded: 40, refundable: 5, refunds: [] },
    ])
    const tree = await open(<AdminPaymentsScreen />)
    await act(async () => buttonByText(tree, t('admRefund')).props.onPress())
    await act(async () => fieldByLabel(tree, t('admRefundAmount')).props.onChangeText('10'))
    await act(async () => fieldByLabel(tree, t('admRefundReason')).props.onChangeText('x'))
    await act(async () => buttonByText(tree, t('admRefundSend')).props.onPress())
    expect(refundPlanPayment).not.toHaveBeenCalled()
    expect(fieldByLabel(tree, t('admRefundAmount')).props.error).toBe('אפשר להחזיר עד ₪ 5')
    await act(async () => tree.unmount())
  })
})

describe('jewelry payouts', () => {
  it('records the transfer to the jeweler with its reference', async () => {
    ;(listJewelryPayments as jest.Mock).mockResolvedValue([])
    ;(listPayouts as jest.Mock).mockResolvedValue([
      {
        id: 'po-1',
        paymentId: 'jp-1',
        status: 'OWED',
        currency: 'ILS',
        gross: 1500,
        commission: 150,
        net: 1350,
        refunded: 0,
        due: 1350,
        paidAt: null,
        paidReference: null,
        createdAt: '',
        jeweler: { id: 'j1', email: 'gold@example.com', name: 'אבי', businessName: 'אבי תכשיטים', phone: '+972501234567' },
      },
    ])
    ;(markPayoutPaid as jest.Mock).mockResolvedValue({ id: 'po-1', status: 'PAID' })
    const tree = await open(<AdminJewelryScreen />)
    const chips = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' && node.props.accessibilityState)
    await act(async () => chips[1].props.onPress())
    expect(texts(tree)).toContain('להעביר לצורף: ₪ 1,350')
    await act(async () => fieldByLabel(tree, t('admTransferRef')).props.onChangeText('העברה 4471'))
    await act(async () => buttonByText(tree, t('admMarkPaid')).props.onPress())
    expect(markPayoutPaid).toHaveBeenCalledWith('po-1', 'העברה 4471')
    await act(async () => tree.unmount())
  })
})
