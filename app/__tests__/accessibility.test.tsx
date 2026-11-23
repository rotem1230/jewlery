import { Alert, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { HomeHeader } from '../src/components/home/HomeHeader'
import { AccessibilityScreen } from '../src/screens/shared/AccessibilityScreen'
import { setAccessibilityOpener } from '../src/lib/accessibilityLink'
import { t } from '../src/i18n'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
// Like the other screen tests: navigation mocked with only what screens use (no container ref).
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }) }))

jest.setTimeout(60_000)

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(element)
  })
  return tree
}

const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n')

afterEach(() => jest.clearAllMocks())

describe('accessibility (notes of 23.11)', () => {
  it('every screen header carries an accessibility icon that opens the accessibility page', async () => {
    const open = jest.fn()
    setAccessibilityOpener(open)
    const tree = await render(<HomeHeader />)
    const icon = tree.root.find((node) => node.props.accessibilityLabel === t('a11yOpen') && typeof node.props.onPress === 'function')
    await act(async () => icon.props.onPress())
    expect(open).toHaveBeenCalledTimes(1)
    setAccessibilityOpener(null)
    // Nothing registered (a test of another screen): pressing does nothing, and nothing breaks.
    await act(async () => icon.props.onPress())
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('the accessibility page states what the app supports and whom to contact', async () => {
    const tree = await render(<AccessibilityScreen />)
    const all = texts(tree)
    expect(all).toContain(t('a11yTitle'))
    expect(all).toContain(t('a11yContactTitle'))
    expect(all).toContain('litvak_tzilla@hotmail.com')
  })
})

describe('help on the way (notes of 23.11)', () => {
  it('a header with help shows "?" that explains how to go on', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const tree = await render(<HomeHeader help={{ title: 'כותרת', body: 'מה עושים עכשיו' }} />)
    const help = tree.root.find((node) => node.props.accessibilityLabel === t('helpOpen') && typeof node.props.onPress === 'function')
    await act(async () => help.props.onPress())
    expect(alert).toHaveBeenCalledWith('כותרת', 'מה עושים עכשיו')
    alert.mockRestore()
  })
})
