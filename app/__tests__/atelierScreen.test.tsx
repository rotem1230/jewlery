import { Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { AtelierScreen } from '../src/screens/shared/AtelierScreen'
import { listAtelierDesigns } from '../src/api/atelier'
import { viewInAtelierTarget } from '../src/lib/atelierView'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))

const mockRoute: { params: Record<string, unknown> | undefined } = { params: undefined }
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
  useRoute: () => ({ key: 'AtelierList', name: 'AtelierList', params: mockRoute.params }),
}))
const PUBLISHED = {
  id: 'design-7',
  title: 'My new ring',
  status: 'PUBLISHED',
  ownerUserId: 'me',
  publishedAt: '2026-11-23T10:00:00.000Z',
  expiresAt: '2026-12-23T10:00:00.000Z',
  itemType: { id: 'ring-type', code: 'RING', labelHe: 'טבעת', labelEn: 'Ring' },
}
jest.mock('../src/api/atelier', () => ({
  listAtelierBanners: jest.fn(async () => []),
  listAtelierDesigns: jest.fn(async () => ({ items: [PUBLISHED], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } })),
  listAtelierGeoSearch: jest.fn(async () => {
    throw new Error('off')
  }),
  listAtelierJewelers: jest.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })),
}))
jest.mock('../src/api/masterData', () => ({ listRegions: jest.fn(async () => []) }))
jest.mock('../src/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ auth: { accessToken: 'token-1', user: { id: 'me', activeRole: 'DESIGNER' } } }),
}))

jest.setTimeout(120_000)

const settle = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0))

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n')
}

let mounted: ReactTestRenderer | null = null

// The screen's search waits 350 ms before it runs: unmounting stops it after each test.
afterEach(async () => {
  await act(async () => mounted?.unmount())
  mounted = null
  jest.clearAllMocks()
  mockRoute.params = undefined
})

describe('"view the item in the atelier" after publishing (notes of 23.11)', () => {
  it('goes to the atelier\'s designs, asking for a fresh list', () => {
    expect(viewInAtelierTarget(1234)).toEqual(['Atelier', { screen: 'AtelierList', initial: false, params: { tab: 'designs', refreshAt: 1234 } }])
  })

  it('a designer sent there sees the designs (not the jewelers), with the item just published', async () => {
    mockRoute.params = { tab: 'designs', refreshAt: 1 }
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<AtelierScreen />)
      mounted = tree
      await settle()
    })
    expect(texts(tree)).toContain('My new ring')
  })

  it('sent there again (the atelier already open from before), the list is loaded again', async () => {
    mockRoute.params = undefined
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<AtelierScreen />)
      mounted = tree
      await settle()
    })
    const before = (listAtelierDesigns as jest.Mock).mock.calls.length
    mockRoute.params = { tab: 'designs', refreshAt: 2 }
    await act(async () => {
      tree.update(<AtelierScreen />)
      await settle()
    })
    expect((listAtelierDesigns as jest.Mock).mock.calls.length).toBeGreaterThan(before)
    expect(texts(tree)).toContain('My new ring')
  })
})
