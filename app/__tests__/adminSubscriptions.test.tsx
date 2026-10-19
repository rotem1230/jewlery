import { Alert, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { addSubscriptionLeads, endSubscription, extendSubscription, listAdminSubscriptions, type AdminSubscription } from '../src/api/admin'
import { Button } from '../src/components/ui/Button'
import { Field } from '../src/components/ui/Field'
import { t } from '../src/i18n'
import { AdminSubscriptionsScreen } from '../src/screens/admin/AdminSubscriptionsScreen'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
jest.mock('@react-navigation/native', () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() }
  return { useNavigation: () => navigation, useRoute: () => ({ params: {} }), useFocusEffect: () => undefined }
})
jest.mock('../src/api/admin', () => ({
  listAdminSubscriptions: jest.fn(),
  extendSubscription: jest.fn(),
  addSubscriptionLeads: jest.fn(),
  endSubscription: jest.fn(),
}))

jest.setTimeout(60_000)

const DAY_MS = 24 * 60 * 60 * 1000

const JEWELER: AdminSubscription = {
  id: 's1',
  user: { id: 'u1', email: 'gold@example.com', name: 'אבי זהב', phone: '+972501234567' },
  role: 'JEWELER',
  plan: { code: 'JEWELER_BASIC_QUARTERLY', nameHe: 'צורף/ת - בסיסית' },
  pendingPlan: null,
  status: 'ACTIVE',
  price: 390,
  currency: 'ILS',
  billingCycle: 'QUARTERLY',
  currentPeriodStart: new Date(Date.now() - 10 * DAY_MS).toISOString(),
  currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS + 60_000).toISOString(),
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  hasCard: true,
  createdAt: '',
  leads: { quota: 10, total: 10, used: 3, reserved: 0, available: 7, refunded: 0 },
}

const DESIGNER: AdminSubscription = {
  ...JEWELER,
  id: 's2',
  user: { id: 'u2', email: 'dana@example.com', name: null, phone: null },
  role: 'DESIGNER',
  plan: { code: 'DESIGNER_PREMIUM_ANNUAL', nameHe: 'מעצב/ת - פרימיום שנתי' },
  leads: null,
}

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(<AdminSubscriptionsScreen />)
  })
  return tree
}

const fields = (tree: ReactTestRenderer, label: string) => tree.root.findAll((node) => node.type === Field && node.props.label === label)
const buttons = (tree: ReactTestRenderer, text: string) => tree.root.findAll((node) => node.type === Button && node.props.children === text)
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))

let alerts: Array<{ message: string; buttons?: Array<{ text?: string; onPress?: () => void; style?: string }> }>

beforeEach(() => {
  jest.clearAllMocks()
  alerts = []
  jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
    alerts.push({ message: String(message), buttons: buttons as typeof alerts[number]['buttons'] })
  })
  ;(listAdminSubscriptions as jest.Mock).mockResolvedValue({ total: 2, page: 1, pageSize: 30, items: [JEWELER, DESIGNER] })
})

describe('plans and leads for the admin', () => {
  it("lists live plans with each one's validity and a jeweler's leads; a search asks the server", async () => {
    const tree = await open()
    expect(listAdminSubscriptions).toHaveBeenLastCalledWith({ status: 'live', page: 1 }, expect.anything())
    const shown = texts(tree)
    expect(shown).toContain('אבי זהב')
    expect(shown.some((text) => text.startsWith('בתוקף עד ') && text.includes('(עוד 31 ימים)'))).toBe(true)
    expect(shown).toContain('לידים: נוצלו 3 מתוך 10 · נשארו 7')

    await act(async () => fields(tree, t('admSubsSearch'))[0].props.onChangeText('0501234567'))
    await act(async () => buttons(tree, t('admSubsSearchGo'))[0].props.onPress())
    expect(listAdminSubscriptions).toHaveBeenLastCalledWith({ status: 'live', page: 1, q: '0501234567' }, expect.anything())
    await act(async () => tree.unmount())
  })

  it('extends a plan once per request (a double tap is the same request) and shows the new end', async () => {
    ;(extendSubscription as jest.Mock).mockResolvedValue({ ...JEWELER, currentPeriodEnd: new Date(Date.now() + 61 * DAY_MS).toISOString() })
    const tree = await open()
    await act(async () => buttons(tree, t('admSubsActions'))[0].props.onPress())
    await act(async () => fields(tree, t('admExtendDays'))[0].props.onChangeText('30'))
    await act(async () => fields(tree, t('admActionReason'))[0].props.onChangeText('פיצוי על תקלה'))
    const extend = buttons(tree, t('admExtend'))[0]
    await act(async () => {
      extend.props.onPress()
      extend.props.onPress()
    })
    const calls = (extendSubscription as jest.Mock).mock.calls
    expect(calls[0]).toEqual(['s1', { days: 30, reason: 'פיצוי על תקלה', requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) }])
    expect(new Set(calls.map((call) => call[1].requestId)).size).toBe(1)
    expect(alerts.some((alert) => alert.message.startsWith(t('admExtendDone')))).toBe(true)
    await act(async () => tree.unmount())
  })

  it("adds leads to a jeweler's plan; a bad count is explained and nothing is sent", async () => {
    ;(addSubscriptionLeads as jest.Mock).mockResolvedValue({ ...JEWELER, leads: { ...JEWELER.leads, total: 15, available: 12 } })
    const tree = await open()
    await act(async () => buttons(tree, t('admSubsActions'))[0].props.onPress())
    await act(async () => fields(tree, t('admActionReason'))[0].props.onChangeText('מבצע'))
    await act(async () => fields(tree, t('admLeadsCount'))[0].props.onChangeText('0'))
    await act(async () => buttons(tree, t('admAddLeads'))[0].props.onPress())
    expect(addSubscriptionLeads).not.toHaveBeenCalled()
    expect(fields(tree, t('admLeadsCount'))[0].props.error).toBe('מספר שלם בין 1 ל-100')

    await act(async () => fields(tree, t('admLeadsCount'))[0].props.onChangeText('5'))
    await act(async () => buttons(tree, t('admAddLeads'))[0].props.onPress())
    expect(addSubscriptionLeads).toHaveBeenCalledWith('s1', { count: 5, reason: 'מבצע', requestId: expect.any(String) })
    await act(async () => tree.unmount())
  })

  it("a designer's plan has no leads; ending a plan now is confirmed first", async () => {
    ;(endSubscription as jest.Mock).mockResolvedValue({ ...DESIGNER, status: 'CANCELLED', cancelAtPeriodEnd: true })
    const tree = await open()
    await act(async () => buttons(tree, t('admSubsActions'))[1].props.onPress())
    expect(fields(tree, t('admLeadsCount'))).toHaveLength(0)
    await act(async () => fields(tree, t('admActionReason'))[0].props.onChangeText('הונאה'))
    await act(async () => buttons(tree, t('admEndNow'))[0].props.onPress())
    expect(endSubscription).not.toHaveBeenCalled()
    const confirm = alerts[alerts.length - 1].buttons?.find((button) => button.style === 'destructive')
    expect(confirm).toBeDefined()
    await act(async () => confirm?.onPress?.())
    expect(endSubscription).toHaveBeenCalledWith('s2', { immediately: true, reason: 'הונאה', requestId: expect.any(String) })
    await act(async () => tree.unmount())
  })
})
