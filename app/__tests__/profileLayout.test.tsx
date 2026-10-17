import { StyleSheet, Text, View } from 'react-native'
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { t } from '../src/i18n'
import { ProfileScreen } from '../src/screens/shared/ProfileScreen'
import { BusinessProfileViewScreen } from '../src/screens/shared/BusinessProfileViewScreen'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
// The icon package ships ES modules only; icons draw nothing in these tests.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
jest.mock('@react-navigation/native', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() }
  return { useNavigation: () => navigation }
})
jest.mock('../src/components/home/HomeHeader', () => ({ HomeHeader: () => null }))
jest.mock('../src/components/auth/PhoneField', () => ({ PhoneField: () => null }))
jest.mock('../src/components/ui/Field', () => ({ Field: () => null }))
jest.mock('../src/components/ui/Button', () => ({ Button: () => null }))
jest.mock('../src/components/jeweler/BusinessProfileSummary', () => ({ BusinessProfileSummary: () => null }))
jest.mock('../src/api/designs', () => ({ listDesigns: jest.fn(async () => ({ items: [], tabCounts: { all: 0 }, pagination: { total: 0 } })) }))
jest.mock('../src/api/chat', () => ({ listConversations: jest.fn(async () => ({ items: [], pagination: { total: 0 } })) }))
jest.mock('../src/api/auth', () => ({
  getMe: jest.fn(async () => ({ firstName: 'Avi', lastName: 'Cohen', phone: null })),
  changePassword: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  updateMe: jest.fn(),
}))
jest.mock('../src/hooks/useMyBusinessProfile', () => ({
  useMyBusinessProfile: () => ({
    profile: { name: 'QA Goldsmith', about: '', gallery: [], reviews: [] },
    data: { businessHours: null, serviceAreaText: null },
    loading: false,
    refreshing: false,
    error: null,
    refresh: jest.fn(),
    retry: jest.fn(),
  }),
}))
jest.mock('../src/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({
      auth: {
        accessToken: 'token-1',
        refreshToken: 'refresh-1',
        user: { id: 'u1', email: 'qa.designer@malinvosky.test', firstName: 'Avi', lastName: 'Cohen', roles: ['DESIGNER'], activeRole: 'DESIGNER' },
      },
    }),
}))

jest.setTimeout(60_000)

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(element)
  })
  return tree
}

function textNode(tree: ReactTestRenderer, label: string): ReactTestInstance {
  return tree.root.find((node) => node.type === Text && node.props.children === label)
}

/** The nearest ancestor that matches. */
function ancestor(node: ReactTestInstance, matches: (candidate: ReactTestInstance) => boolean): ReactTestInstance {
  let current: ReactTestInstance | null = node.parent
  while (current && !matches(current)) current = current.parent
  if (!current) throw new Error('no ancestor')
  return current
}

describe('profile screen menu (RTL)', () => {
  it('each "<" sits on the same row as its label: the row is laid out by a plain View', async () => {
    const tree = await render(<ProfileScreen />)
    for (const key of ['profilePricing', 'profileAbout', 'profileHelp'] as const) {
      const label = textNode(tree, t(key))
      const row = ancestor(label, (node) => node.type === View)
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row' })
      // NativeWind's Pressable drops a style *function*: layout there would collapse into a column.
      const pressable = ancestor(label, (node) => typeof node.props.onPress === 'function')
      const pressableStyle = typeof pressable.props.style === 'function' ? pressable.props.style({ pressed: false }) : pressable.props.style
      expect(StyleSheet.flatten(pressableStyle)?.flexDirection).toBeUndefined()
      // The chevron's slot is in the same row as the label.
      expect(row.findAllByType(View).length).toBeGreaterThanOrEqual(1)
    }
    await act(async () => tree.unmount())
  })
})

describe("jeweler's business profile (RTL)", () => {
  it('the top links align to the right edge', async () => {
    const tree = await render(<BusinessProfileViewScreen />)
    for (const label of [t('profileAccountLink'), t('businessProfileEditLink')]) {
      const style = StyleSheet.flatten(textNode(tree, label).props.style)
      expect(style.textAlign).toBe('right')
      expect(style.width).toBe('100%')
    }
    await act(async () => tree.unmount())
  })
})
