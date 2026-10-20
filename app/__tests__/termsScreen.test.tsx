import { ScrollView, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { getContentPage } from '../src/api/subscriptions'
import { t } from '../src/i18n'
import { TermsScreen } from '../src/screens/shared/TermsScreen'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
const mockRoute: { params?: { section?: string } } = {}
jest.mock('@react-navigation/native', () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() }
  return { useNavigation: () => navigation, useRoute: () => mockRoute }
})
jest.mock('../src/api/subscriptions', () => ({ getContentPage: jest.fn() }))

jest.setTimeout(60_000)

const PAGE = {
  id: 'tos-1',
  slug: 'tos',
  locale: 'he',
  title: 'תקנון שימוש ומדיניות פרטיות',
  version: 1,
  body: {
    blocks: [
      { type: 'heading', text: 'תקנון שימוש ומדיניות פרטיות – אפליקציית עיצוב תכשיטים' },
      { type: 'section', text: "חלק א': תקנון ותנאי שימוש", id: 'terms' },
      { type: 'subheading', text: '1. כשירות, רישום ויצירת חשבון' },
      { type: 'item', text: '1.1. השימוש באפליקציה...' },
      { type: 'section', text: "חלק ב': מדיניות פרטיות והגנת המידע", id: 'privacy' },
      { type: 'paragraph', text: 'החברה מכבדת את פרטיות המשתמשים...' },
    ],
  },
}

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(<TermsScreen />)
  })
  return tree
}

const textOf = (tree: ReactTestRenderer, text: string) => tree.root.findAll((node) => node.type === Text && node.props.children === text)

beforeEach(() => {
  jest.clearAllMocks()
  mockRoute.params = undefined
})

describe('the terms of use screen', () => {
  it('shows the published terms block by block (headings, parts, clauses)', async () => {
    ;(getContentPage as jest.Mock).mockResolvedValue(PAGE)
    const tree = await open()
    for (const block of PAGE.body.blocks) expect(textOf(tree, block.text)).toHaveLength(1)
    // Each kind has its own look.
    const style = (text: string) => JSON.stringify(textOf(tree, text)[0].props.style)
    expect(style("חלק א': תקנון ותנאי שימוש")).not.toBe(style('1.1. השימוש באפליקציה...'))
    await act(async () => tree.unmount())
  })

  it('opened from "מדיניות הפרטיות", it scrolls to the privacy part once that part is laid out', async () => {
    ;(getContentPage as jest.Mock).mockResolvedValue(PAGE)
    mockRoute.params = { section: 'privacy' }
    const tree = await open()
    const privacy = textOf(tree, "חלק ב': מדיניות פרטיות והגנת המידע")[0]
    await act(async () => privacy.props.onLayout({ nativeEvent: { layout: { x: 0, y: 840, width: 300, height: 24 } } }))
    // React Native's test ScrollView records scrollTo on its instance.
    expect(tree.root.findByType(ScrollView).instance.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 840 }))
    await act(async () => tree.unmount())
  })

  it('without a published page it still shows the built-in summary', async () => {
    ;(getContentPage as jest.Mock).mockResolvedValue(null)
    const tree = await open()
    expect(textOf(tree, t('termsDocTitle'))).toHaveLength(1)
    await act(async () => tree.unmount())
  })
})
