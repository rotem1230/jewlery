import { Alert, Text, type AlertButton } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { getDesign, lockDesign, unlockDesign, updateDesign } from '../src/api/designs'
import { DesignStudioScreen } from '../src/screens/designer/DesignStudioScreen'
import { StudioTabBar, type StudioTabId } from '../src/components/studio/StudioTabBar'
import { StudioSettingPanel } from '../src/components/studio/StudioSettingPanel'
import { StudioStonePanel } from '../src/components/studio/StudioStonePanel'
import { StudioSizePanel } from '../src/components/studio/StudioSizePanel'
import { StudioMetalPanel } from '../src/components/studio/StudioMetalPanel'
import { BrandButton } from '../src/components/ui/BrandButton'
import { addStone, newBand, type StudioSetting } from '../src/lib/studioParams'
import { t } from '../src/i18n'
import type { DesignDetail } from '../src/types/api'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
// The icon package ships ES modules only; icons draw nothing in these tests.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
jest.mock('react-native-webview', () => 'WebView')
// The 3D viewer is a WebView; the studio's own logic is what these tests drive.
jest.mock('../src/components/studio/StudioViewer', () => ({ StudioViewer: () => null }))
jest.mock('../src/components/studio/TryOnPlacement', () => ({ TryOnPlacement: () => null }))
jest.mock('../src/components/chats/ChatImageViewer', () => ({ ChatImageViewer: () => null }))

/**
 * The navigator's side of `usePreventRemove`: whether the screen holds the user back, and the
 * callback it runs when they try to leave. `reset` / `goBack` call it while leaving is held back,
 * as the real navigator does (it asks before it removes the screen).
 */
const mockLeave: { prevent: boolean; onPrevent: ((event: { data: { action: unknown } }) => void) | null } = {
  prevent: false,
  onPrevent: null,
}
function mockLeaveWith(action: unknown) {
  if (mockLeave.prevent) mockLeave.onPrevent?.({ data: { action } })
}
const mockNavigation = {
  goBack: jest.fn(() => mockLeaveWith({ type: 'GO_BACK' })),
  reset: jest.fn((state: unknown) => mockLeaveWith({ type: 'RESET', payload: state })),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  getParent: () => ({ navigate: jest.fn() }),
}
const mockRouteParams: { designId: string; start?: boolean } = { designId: 'design-1' }
jest.mock('@react-navigation/native', () => {
  return {
    useNavigation: () => mockNavigation,
    useRoute: () => ({ key: 'DesignStudio', name: 'DesignStudio', params: mockRouteParams }),
    usePreventRemove: (prevent: boolean, callback: (event: { data: { action: unknown } }) => void) => {
      mockLeave.prevent = prevent
      mockLeave.onPrevent = callback
    },
  }
})
jest.mock('../src/api/designs', () => ({ getDesign: jest.fn(), lockDesign: jest.fn(), unlockDesign: jest.fn(), updateDesign: jest.fn() }))
jest.mock('../src/api/ai', () => ({ createInspiration: jest.fn(), waitForAiJob: jest.fn() }))
jest.mock('../src/api/renderJobs', () => ({ createRenderJob: jest.fn(), waitForRenderJob: jest.fn() }))
jest.mock('../src/api/visualization', () => ({ createVisualizationJob: jest.fn(), getFeatureFlags: jest.fn(), getTryOnOverlay: jest.fn() }))
jest.mock('../src/api/subscriptions', () => ({ getMyEntitlements: jest.fn() }))
jest.mock('../src/api/masterData', () => ({
  CATEGORY_CODE: { ring: 'RING', necklace: 'NECKLACE', bracelet: 'BRACELET', earrings: 'EARRINGS' },
  listElements: jest.fn(async () => []),
  listMetals: jest.fn(async () => []),
  listSettings: jest.fn(async () => []),
  listStones: jest.fn(async () => []),
  listWizardSizeCharts: jest.fn(async () => []),
}))
jest.mock('../src/api/uploads', () => ({ deleteUpload: jest.fn(), uploadChatFile: jest.fn() }))
jest.mock('../src/lib/pendingAiJobs', () => ({
  attachedAiJob: jest.fn(),
  rememberPendingAiJob: jest.fn(),
  takeFinishedAiJob: jest.fn(async () => null),
}))
jest.mock('../src/lib/chatAttachments', () => ({ pickChatPhoto: jest.fn(), pickTryOnPhoto: jest.fn() }))
jest.mock('../src/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { accessToken: 'token-1' } }),
}))

// The first run transforms the whole screen tree (over a minute on a cold cache under load).
jest.setTimeout(120_000)

const navigation = mockNavigation

/** A ring as saved on the server: its size and metal, no setting or stones yet. */
let saved: DesignDetail
function ring(): DesignDetail {
  return {
    id: 'design-1',
    ownerUserId: 'me',
    itemTypeId: 'ring-type',
    title: 'Evening ring',
    description: null,
    status: 'DRAFT',
    thumbnailUploadId: null,
    parameters: {
      size: { standard: 'IL', sizeCode: '56', bandWidthMm: 6 },
      metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
    },
    publishedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    itemType: { id: 'ring-type', code: 'RING', labelHe: 'טבעת', labelEn: 'Ring' },
    quoteCount: 0,
    version: 3,
    lockedFields: [],
  }
}

const PAVE: StudioSetting = { headCode: '', band: newBand('PAVE') }
let alert: jest.SpyInstance

beforeEach(() => {
  saved = ring()
  ;(getDesign as jest.Mock).mockImplementation(async () => saved)
  ;(updateDesign as jest.Mock).mockImplementation(async (_id: string, body: { version: number; parameters: Record<string, unknown> }) => {
    saved = { ...saved, version: body.version + 1, parameters: body.parameters }
    return saved
  })
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  mockLeave.prevent = false
  mockLeave.onPrevent = null
  delete mockRouteParams.start
})

afterEach(() => {
  jest.clearAllMocks()
  alert.mockRestore()
})

async function renderStudio(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(<DesignStudioScreen />)
  })
  return tree
}

async function openTab(tree: ReactTestRenderer, id: StudioTabId) {
  await act(async () => tree.root.findByType(StudioTabBar).props.onSelect(id))
}

/** Lets the async work a tap started (saving, reloading) run to its end. */
const settle = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0))

async function press(tree: ReactTestRenderer, label: string) {
  const button = tree.root.findAllByType(BrandButton).find((node) => node.props.label === label)
  if (!button) throw new Error(`no button "${label}"`)
  await act(async () => {
    button.props.onPress()
    await settle()
  })
}

/** The pavé band picked in the setting tab, then a sapphire added in the stone tab. */
async function pavéThenSapphire(tree: ReactTestRenderer) {
  await openTab(tree, 'setting')
  await act(async () => tree.root.findByType(StudioSettingPanel).props.onChange(PAVE))
  await openTab(tree, 'stone')
  await act(async () => tree.root.findByType(StudioStonePanel).props.onChange(addStone('RING', [], 'SAPPHIRE')))
}

function savedParameters(call = 0): Record<string, unknown> {
  return (updateDesign as jest.Mock).mock.calls[call][1].parameters
}

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n')
}

function alertButtons(call = 0): AlertButton[] {
  return alert.mock.calls[call][2] as AlertButton[]
}

describe('the studio saves what the model shows', () => {
  it('"סיימתי" in the stone tab also saves the band of small stones picked just before', async () => {
    const tree = await renderStudio()
    await pavéThenSapphire(tree)
    await press(tree, 'סיימתי')

    expect(updateDesign).toHaveBeenCalledTimes(1)
    expect(savedParameters()).toMatchObject({
      setting: { band: { settingCode: 'PAVE', stoneCode: 'DIAMOND' } },
      stones: [{ stoneCode: 'SAPPHIRE' }],
      size: { sizeCode: '56', bandWidthMm: 6 },
    })
    // Nothing is left unsaved: leaving does not ask.
    expect(mockLeave.prevent).toBe(false)
  })

  it('the band\'s small stones are chosen in the stone tab, in a section of their own (notes of 23.11)', async () => {
    const tree = await renderStudio()
    await pavéThenSapphire(tree)
    const panel = tree.root.findByType(StudioStonePanel)
    expect(panel.props.band).toMatchObject({ settingCode: 'PAVE', stoneCode: 'DIAMOND' })
    await act(async () => panel.props.onBandChange({ ...panel.props.band, stoneCode: 'RUBY', colorCode: 'RUBY' }))
    await press(tree, 'סיימתי')
    expect(savedParameters()).toMatchObject({
      setting: { band: { settingCode: 'PAVE', stoneCode: 'RUBY', colorCode: 'RUBY' } },
      stones: [{ stoneCode: 'SAPPHIRE' }],
    })
  })

  it('"ביטול" in the stone tab also undoes the band\'s stones changed there, and only those', async () => {
    const tree = await renderStudio()
    await pavéThenSapphire(tree)
    const panel = tree.root.findByType(StudioStonePanel)
    await act(async () => panel.props.onBandChange({ ...panel.props.band, stoneCode: 'RUBY', colorCode: 'RUBY' }))
    await press(tree, 'ביטול')
    // The band picked before in the setting tab is still there, with its own stones.
    await openTab(tree, 'stone')
    expect(tree.root.findByType(StudioStonePanel).props.band).toMatchObject({ settingCode: 'PAVE', stoneCode: 'DIAMOND' })
  })

  it('"ביטול" in the stone tab of a saved band leaves nothing to save', async () => {
    saved = { ...ring(), parameters: { ...ring().parameters, setting: { headCode: '', band: newBand('PAVE') } } }
    const tree = await renderStudio()
    await openTab(tree, 'stone')
    const panel = tree.root.findByType(StudioStonePanel)
    await act(async () => panel.props.onBandChange({ ...panel.props.band, stoneCode: 'RUBY', colorCode: 'RUBY' }))
    await press(tree, 'ביטול')
    expect(mockLeave.prevent).toBe(false)
    await openTab(tree, 'stone')
    expect(tree.root.findByType(StudioStonePanel).props.band).toMatchObject({ stoneCode: 'DIAMOND' })
  })

  it('every panel has its own "?" that says what to do there and what comes next', async () => {
    const tree = await renderStudio()
    for (const tab of ['size', 'metal', 'setting', 'stone', 'elements', 'inspiration'] as StudioTabId[]) {
      await openTab(tree, tab)
      const help = tree.root.find((node) => node.props.testID === 'panel-help' && typeof node.props.onPress === 'function')
      await act(async () => help.props.onPress())
      const [title, body] = alert.mock.calls[alert.mock.calls.length - 1]
      expect({ tab, title }).toEqual({ tab, title: expect.stringContaining('?') })
      expect({ tab, long: String(body).length > 40 }).toEqual({ tab, long: true })
    }
    expect(new Set(alert.mock.calls.map((call) => call[1])).size).toBe(6)
    // The size tab's help names the next step: the metal.
    expect(alert.mock.calls[0]).toEqual([t('studioHelpSizeTitle'), t('studioHelpSizeBody')])
    expect(t('studioHelpSizeBody')).toContain('מתכת')
  })
})

describe('drafts only opened are left alone', () => {
  it('an older letters element with no text, only opened, neither blocks "סיימתי" in another tab nor is rewritten', async () => {
    const letters = { elementCode: 'LETTERS', placement: { offsetMm: 0, rotationDeg: 0 } }
    saved = { ...ring(), parameters: { ...ring().parameters, elements: [letters] } }
    const tree = await renderStudio()
    await openTab(tree, 'elements')
    await openTab(tree, 'stone')
    await act(async () => tree.root.findByType(StudioStonePanel).props.onChange(addStone('RING', [], 'RUBY')))
    await press(tree, 'סיימתי')

    expect(alert).not.toHaveBeenCalled()
    expect(updateDesign).toHaveBeenCalledTimes(1)
    expect(savedParameters().elements).toEqual([letters])
    expect(savedParameters().stones).toMatchObject([{ stoneCode: 'RUBY' }])
  })

  it('"סיימתי" in the size tab with nothing changed saves nothing, locks nothing and moves on to the metal', async () => {
    const tree = await renderStudio()
    await openTab(tree, 'size')
    await press(tree, 'סיימתי')
    expect(updateDesign).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()
    expect(lockDesign).not.toHaveBeenCalled()
    expect(tree.root.findAllByType(StudioMetalPanel)).toHaveLength(1)
  })
})

describe('the design steps in order (notes of 23.11)', () => {
  it('a design just made in the wizard opens on its first step, the ring band', async () => {
    mockRouteParams.start = true
    const tree = await renderStudio()
    expect(tree.root.findAllByType(StudioSizePanel)).toHaveLength(1)
  })

  it('after the band width comes the metal, already open', async () => {
    mockRouteParams.start = true
    const tree = await renderStudio()
    await act(async () => tree.root.findByType(StudioSizePanel).props.onChange({ ...tree.root.findByType(StudioSizePanel).props.value, bandWidthMm: 3 }))
    await press(tree, 'סיימתי')
    expect(updateDesign).toHaveBeenCalledTimes(1)
    expect(savedParameters().size).toMatchObject({ bandWidthMm: 3, sizeCode: '56' })
    expect(lockDesign).not.toHaveBeenCalled()
    expect(tree.root.findAllByType(StudioMetalPanel)).toHaveLength(1)
    expect(tree.root.findAllByType(StudioSizePanel)).toHaveLength(0)
  })

  it('the ring size itself can be changed in the size tab', async () => {
    const tree = await renderStudio()
    await openTab(tree, 'size')
    const panel = tree.root.findByType(StudioSizePanel)
    await act(async () => panel.props.onChange({ ...panel.props.value, standard: 'IL', sizeCode: '57' }))
    await press(tree, 'סיימתי')
    expect(savedParameters().size).toMatchObject({ standard: 'IL', sizeCode: '57', bandWidthMm: 6 })
  })

  it('a size typed in that is not one holds "סיימתי" back, instead of saving the size before', async () => {
    const tree = await renderStudio()
    await openTab(tree, 'size')
    const input = tree.root.find((node) => node.props.testID === 'custom-ring-size' && typeof node.props.onChangeText === 'function')
    await act(async () => input.props.onChangeText('85'))
    const done = () => tree.root.findAllByType(BrandButton).find((node) => node.props.label === 'סיימתי')!
    expect(done().props.disabled).toBe(true)
    await act(async () => input.props.onChangeText('57'))
    expect(done().props.disabled).toBe(false)
    await press(tree, 'סיימתי')
    expect(savedParameters().size).toMatchObject({ standard: 'IL', sizeCode: '57' })
  })

  it('a draft whose size was locked before can be opened again from the size tab', async () => {
    saved = { ...ring(), lockedFields: ['size'] }
    ;(unlockDesign as jest.Mock).mockImplementation(async () => {
      saved = { ...saved, lockedFields: [], version: saved.version + 1 }
      return saved
    })
    const tree = await renderStudio()
    await openTab(tree, 'size')
    expect(tree.root.findByType(StudioSizePanel).props.locked).toBe(true)
    expect(texts(tree)).toContain(t('studioSizeLocked'))
    await act(async () => {
      tree.root.findByType(StudioSizePanel).props.onUnlock()
      await settle()
    })
    expect(unlockDesign).toHaveBeenCalledWith('design-1', { fields: ['size'] })
    expect(tree.root.findByType(StudioSizePanel).props.locked).toBe(false)
    expect(texts(tree)).not.toContain(t('studioSizeLocked'))
  })
})

describe('leaving the studio with changes not saved', () => {
  it('back pressed while a save is running neither asks nor saves again', async () => {
    let finish!: (design: DesignDetail) => void
    ;(updateDesign as jest.Mock).mockImplementationOnce(
      (_id: string, body: { version: number; parameters: Record<string, unknown> }) =>
        new Promise<DesignDetail>((resolve) => {
          finish = (design) => resolve(design)
          saved = { ...saved, version: body.version + 1, parameters: body.parameters }
        }),
    )
    const tree = await renderStudio()
    await pavéThenSapphire(tree)
    await press(tree, 'סיימתי')
    await act(async () => navigation.goBack())
    expect(alert).not.toHaveBeenCalled()
    expect(updateDesign).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish(saved)
      await settle()
    })
    expect(mockLeave.prevent).toBe(false)
  })

  it('opening a tab without changing anything does not hold the user back', async () => {
    const tree = await renderStudio()
    await openTab(tree, 'stone')
    await openTab(tree, 'setting')
    expect(mockLeave.prevent).toBe(false)
    await act(async () => navigation.goBack())
    expect(alert).not.toHaveBeenCalled()
  })

  it('asks first: stay, leave without saving, or save and leave', async () => {
    const tree = await renderStudio()
    await pavéThenSapphire(tree)
    expect(mockLeave.prevent).toBe(true)

    await act(async () => navigation.goBack())
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][0]).toBe('לשמור את השינויים?')
    expect(alertButtons().map((button) => button.text)).toEqual(['ביטול', 'יציאה בלי לשמור', 'שמירה'])
    // "ביטול": nothing is saved and the user stays.
    expect(navigation.dispatch).not.toHaveBeenCalled()

    // "שמירה": everything shown is saved, then the screen goes.
    await act(async () => {
      alertButtons()[2].onPress?.()
      await settle()
    })
    expect(updateDesign).toHaveBeenCalledTimes(1)
    expect(savedParameters()).toMatchObject({ setting: { band: { settingCode: 'PAVE' } }, stones: [{ stoneCode: 'SAPPHIRE' }] })
    expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' })
  })

  it('"יציאה בלי לשמור" leaves and saves nothing', async () => {
    const tree = await renderStudio()
    await pavéThenSapphire(tree)
    await act(async () => navigation.goBack())
    await act(async () => {
      alertButtons()[1].onPress?.()
      await settle()
    })
    expect(updateDesign).not.toHaveBeenCalled()
    expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' })
  })

  it('a save that fails keeps the user in the studio with the changes', async () => {
    ;(updateDesign as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    const tree = await renderStudio()
    await pavéThenSapphire(tree)
    await act(async () => navigation.goBack())
    await act(async () => {
      alertButtons()[2].onPress?.()
      await settle()
    })
    expect(navigation.dispatch).not.toHaveBeenCalled()
    expect(mockLeave.prevent).toBe(true)
  })

  it('"המשך לפרטי עיצוב" saves everything and leaves without asking', async () => {
    const tree = await renderStudio()
    await openTab(tree, 'setting')
    await act(async () => tree.root.findByType(StudioSettingPanel).props.onChange(PAVE))
    // Tapping the open tab again folds the panel; the change stays on the model.
    await openTab(tree, 'setting')
    await press(tree, 'המשך לפרטי עיצוב')

    expect(updateDesign).toHaveBeenCalledTimes(1)
    expect(savedParameters()).toMatchObject({ setting: { band: { settingCode: 'PAVE' } } })
    expect(navigation.reset).toHaveBeenCalledTimes(1)
    // The navigator asked before removing the screen (the drafts were still in state): the studio let it go.
    expect(alert).not.toHaveBeenCalled()
  })
})
