import { Text, TextInput } from 'react-native'
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { SizeSelectScreen } from '../src/screens/designer/SizeSelectScreen'
import { Button } from '../src/components/ui/Button'
import { createWizardDesign } from '../src/lib/wizard'
import { t } from '../src/i18n'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() }
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'SizeSelect', name: 'SizeSelect', params: { category: 'ring' } }),
}))
jest.mock('../src/api/masterData', () => ({
  CATEGORY_CODE: { ring: 'RING', necklace: 'NECKLACE', bracelet: 'BRACELET', earrings: 'EARRINGS' },
  // Offline: the screen falls back to its own chart.
  listWizardSizeCharts: jest.fn(async () => []),
  listMetals: jest.fn(async () => []),
  metalChoices: jest.fn(() => [{ id: 'YELLOW_GOLD:14K', label: 'זהב צהוב 14K', metalCode: 'YELLOW_GOLD', purityCode: '14K' }]),
  parseMetalChoice: jest.fn(() => ({ metalCode: 'YELLOW_GOLD', purityCode: '14K' })),
}))
jest.mock('../src/lib/wizard', () => ({ createWizardDesign: jest.fn(async () => 'design-9'), wizardFailAlert: jest.fn() }))

jest.setTimeout(120_000)

const settle = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0))

async function render(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(<SizeSelectScreen />)
    await settle()
  })
  return tree
}

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n')
}

function pressable(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const text = tree.root.findAll((node) => node.type === Text && [node.props.children].flat().join('') === label)[0]
  if (!text) throw new Error(`no "${label}"`)
  let node: ReactTestInstance | null = text
  while (node && typeof node.props.onPress !== 'function') node = node.parent
  if (!node) throw new Error(`"${label}" is not pressable`)
  return node
}

async function continueToStudio(tree: ReactTestRenderer) {
  const button = tree.root.findByType(Button)
  expect(button.props.disabled).toBe(false)
  await act(async () => {
    button.props.onPress()
    await settle()
  })
}

afterEach(() => jest.clearAllMocks())

describe('choosing a ring size (notes of 23.11)', () => {
  it('"standard size" goes on to the design, in the standard size', async () => {
    const tree = await render()
    await continueToStudio(tree)
    expect(createWizardDesign).toHaveBeenCalledWith('ring', t('categoryRing'), expect.objectContaining({ size: { standard: 'IL', sizeCode: '52' } }))
    // The studio opens on the first design step.
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DesignStudio', { designId: 'design-9', start: true })
  })

  it('offers every size, not every other one', async () => {
    const tree = await render()
    for (const size of ['51', '52', '53', '55', '57', '63']) expect(() => pressable(tree, size)).not.toThrow()
    await act(async () => pressable(tree, '57').props.onPress())
    await continueToStudio(tree)
    expect(createWizardDesign).toHaveBeenCalledWith('ring', t('categoryRing'), expect.objectContaining({ size: { standard: 'IL', sizeCode: '57' } }))
  })

  it('a size of one\'s own can be typed in', async () => {
    const tree = await render()
    const input = tree.root.find((node) => node.type === TextInput && node.props.testID === 'custom-ring-size')
    await act(async () => input.props.onChangeText('53.5'))
    await continueToStudio(tree)
    expect(createWizardDesign).toHaveBeenCalledWith('ring', t('categoryRing'), expect.objectContaining({ size: { standard: 'IL', sizeCode: '53.5' } }))
  })

  it('a typed size out of range is explained and does not go on', async () => {
    const tree = await render()
    const input = tree.root.find((node) => node.type === TextInput && node.props.testID === 'custom-ring-size')
    await act(async () => input.props.onChangeText('200'))
    expect(texts(tree)).toContain(t('sizeCustomInvalid'))
    expect(tree.root.findByType(Button).props.disabled).toBe(true)
  })

  it('the metal is chosen in the design studio, right after the band width', async () => {
    const tree = await render()
    expect(texts(tree)).not.toContain(t('designMetalLabel'))
  })
})
