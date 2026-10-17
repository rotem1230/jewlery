import { Image, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { getQuote } from '../src/api/quotes'
import { getFeatureFlags } from '../src/api/visualization'
import { t } from '../src/i18n'
import { QuoteDetailsScreen } from '../src/screens/shared/QuoteDetailsScreen'
import type { QuoteSummary } from '../src/types/api'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
// The icon package ships ES modules only; icons draw nothing in these tests.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
jest.mock('@react-navigation/native', () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() }
  return {
    useNavigation: () => navigation,
    useRoute: () => ({ key: 'QuoteDetails', name: 'QuoteDetails', params: { quoteId: 'quote-1', chatId: 'chat-1' } }),
  }
})
jest.mock('../src/api/quotes', () => ({ getQuote: jest.fn(), acceptQuote: jest.fn(), declineQuote: jest.fn() }))
jest.mock('../src/api/visualization', () => ({ getFeatureFlags: jest.fn() }))
jest.mock('../src/api/jewelryPayments', () => ({ createJewelryPaymentIntent: jest.fn() }))
jest.mock('../src/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ auth: { accessToken: 'token-1', user: { id: 'designer-1' } } }),
}))

jest.setTimeout(60_000)

const ACCEPTED: QuoteSummary = {
  id: 'quote-1',
  conversationId: 'chat-1',
  designId: 'design-1',
  authorUserId: 'jeweler-1',
  materialsCost: '3000',
  laborCost: '1500',
  totalPrice: '4500',
  currency: 'ILS',
  etaBusinessDays: 14,
  notes: 'כולל ליטוש ידני ותעודת אבן',
  status: 'ACCEPTED',
  createdAt: '2026-10-01T10:00:00.000Z',
  author: { id: 'jeweler-1', firstName: 'Avi', lastName: 'Cohen', businessName: 'QA Goldsmith' },
  design: {
    id: 'design-1',
    title: 'טבעת ספיר',
    thumbnailUploadId: null,
    previewUrl: '/uploads/preview-1/content?exp=1&sig=ab',
    status: 'COMPLETED',
    itemType: { code: 'RING', labelHe: 'טבעת' },
    parameters: {},
  },
}

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(<QuoteDetailsScreen />)
  })
  return tree
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))
}

beforeEach(() => {
  ;(getQuote as jest.Mock).mockResolvedValue(ACCEPTED)
})

describe('an accepted quote, for the designer', () => {
  it('offers no in-app payment while that feature is off (it only answered "coming soon")', async () => {
    ;(getFeatureFlags as jest.Mock).mockResolvedValue({ phase3_jewelry_pay: false })
    const tree = await open()
    expect(texts(tree)).not.toContain(t('quotePayInApp'))
    await act(async () => tree.unmount())
  })

  it('offers no in-app payment when the flags cannot be loaded', async () => {
    ;(getFeatureFlags as jest.Mock).mockRejectedValue(new Error('offline'))
    const tree = await open()
    expect(texts(tree)).not.toContain(t('quotePayInApp'))
    await act(async () => tree.unmount())
  })

  it('offers in-app payment once the feature is on', async () => {
    ;(getFeatureFlags as jest.Mock).mockResolvedValue({ phase3_jewelry_pay: true })
    const tree = await open()
    expect(texts(tree)).toContain(t('quotePayInApp'))
    await act(async () => tree.unmount())
  })

  it("shows the jeweler's notes and the picture of the priced design", async () => {
    ;(getFeatureFlags as jest.Mock).mockResolvedValue({})
    const tree = await open()
    expect(texts(tree)).toContain('כולל ליטוש ידני ותעודת אבן')
    expect(texts(tree)).toContain(t('quoteNotesTitle'))
    const [hero] = tree.root.findAllByType(Image)
    expect(hero.props.source).toEqual({ uri: expect.stringContaining('/uploads/preview-1/content') })
    await act(async () => tree.unmount())
  })

  it('a quote without notes shows no notes section', async () => {
    ;(getFeatureFlags as jest.Mock).mockResolvedValue({})
    ;(getQuote as jest.Mock).mockResolvedValue({ ...ACCEPTED, notes: null })
    const tree = await open()
    expect(texts(tree)).not.toContain(t('quoteNotesTitle'))
    await act(async () => tree.unmount())
  })
})
