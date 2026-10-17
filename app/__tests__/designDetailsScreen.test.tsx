import { Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { getDesign } from '../src/api/designs'
import { DesignDetailsScreen } from '../src/screens/designer/DesignDetailsScreen'
import type { DesignDetail } from '../src/types/api'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
// The icon package ships ES modules only; icons draw nothing in these tests.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))

/** Focus events of the screen: `refocus()` is the user coming back to it from another tab. */
const mockFocus: { effect: (() => void) | null } = { effect: null }
jest.mock('@react-navigation/native', () => {
  const mockReact = require('react')
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }
  return {
    useNavigation: () => navigation,
    useRoute: () => ({ key: 'DesignDetails', name: 'DesignDetails', params: { designId: 'design-1' } }),
    // Like the real hook: runs while the screen is focused, again whenever it regains focus.
    useFocusEffect: (effect: () => void) => {
      mockReact.useEffect(() => {
        mockFocus.effect = effect
        effect()
      }, [effect])
    },
  }
})
jest.mock('../src/api/designs', () => ({
  getDesign: jest.fn(),
  listDesignQuotes: jest.fn(async () => []),
  duplicateDesign: jest.fn(),
  transitionDesign: jest.fn(),
  updateDesign: jest.fn(),
}))
jest.mock('../src/api/masterData', () => ({
  listMetals: jest.fn(async () => []),
  listRegions: jest.fn(async () => []),
  metalChoices: () => [],
  parseMetalChoice: jest.fn(),
}))
jest.mock('../src/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { accessToken: 'token-1' } }),
}))

function design(parameters: Record<string, unknown>, version: number): DesignDetail {
  return {
    id: 'design-1',
    ownerUserId: 'me',
    itemTypeId: 'ring-type',
    title: 'Evening ring',
    description: null,
    status: 'DRAFT',
    thumbnailUploadId: null,
    parameters,
    publishedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    itemType: { id: 'ring-type', code: 'RING', labelHe: 'טבעת', labelEn: 'Ring' },
    quoteCount: 0,
    version,
  }
}

const BEFORE_STUDIO = design({ metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' } }, 1)
const AFTER_STUDIO = design(
  {
    metal: { metalCode: 'ROSE_GOLD', purityCode: '18K' },
    setting: { settingCode: 'SOLITAIRE' },
    stones: [{ stoneCode: 'SAPPHIRE', shape: 'OVAL', sizeMm: 6 }],
  },
  2,
)

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n')
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// The first run transforms the whole screen tree.
jest.setTimeout(60_000)

describe('design details after editing in the studio', () => {
  it('shows the new metal, setting and stones when the screen regains focus, without blanking meanwhile', async () => {
    const getDesignMock = getDesign as jest.Mock
    const reload = deferred<DesignDetail>()
    getDesignMock.mockResolvedValueOnce(BEFORE_STUDIO).mockReturnValueOnce(reload.promise)

    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<DesignDetailsScreen />)
    })
    expect(getDesignMock).toHaveBeenCalledTimes(1)
    expect(texts(tree)).toContain('14K')

    // The designer edits in the studio and taps "המשך לפרטי עיצוב": this screen is focused again.
    await act(async () => {
      mockFocus.effect?.()
    })
    expect(getDesignMock).toHaveBeenCalledTimes(2)
    // While the fresh design loads, the screen keeps showing the design (no blank / empty state).
    expect(texts(tree)).toContain('Evening ring')

    await act(async () => {
      reload.resolve(AFTER_STUDIO)
    })
    const shown = texts(tree)
    expect(shown).toContain('18K')
    expect(shown).not.toContain('14K')
    expect(shown).toContain('שיבוץ')
    expect(shown).toContain('אבנים')
    await act(async () => {
      tree.unmount()
    })
  })
})
