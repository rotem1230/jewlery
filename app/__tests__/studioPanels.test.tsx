import { Text, TextInput, View } from 'react-native'
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StudioElementPanel } from '../src/components/studio/StudioElementPanel'
import { StudioSettingPanel } from '../src/components/studio/StudioSettingPanel'
import { StudioStonePanel } from '../src/components/studio/StudioStonePanel'
import { placementFromMessage } from '../src/components/studio/StudioViewer'
import { addElement, addStone, type StudioElement, type StudioSetting, type StudioStone } from '../src/lib/studioParams'

jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('react-native-webview', () => 'WebView')

jest.setTimeout(60_000)

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(element)
  })
  return tree
}

/** The pressable whose text is exactly `label`. */
function pressableWithText(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const text = tree.root.findAll((node) => node.type === Text && node.props.children === label)[0]
  if (!text) throw new Error(`no "${label}"`)
  let node: ReactTestInstance | null = text
  while (node && typeof node.props.onPress !== 'function') node = node.parent
  if (!node) throw new Error(`"${label}" is not pressable`)
  return node
}

async function press(node: ReactTestInstance) {
  await act(async () => {
    node.props.onPress()
  })
}

function slider(tree: ReactTestRenderer, label: string): ReactTestInstance {
  return tree.root.find((node) => node.type === View && node.props.accessibilityRole === 'adjustable' && node.props.accessibilityLabel === label)
}

describe('the stone tab', () => {
  const panel = (stones: StudioStone[], onChange: (s: StudioStone[]) => void) => (
    <StudioStonePanel
      itemType="RING"
      stones={stones}
      onChange={onChange}
      offered={[]}
      parameters={{ stones: [{ stoneCode: 'SAPPHIRE' }] }}
      bandWidthMm={3}
      selected={0}
      onSelect={() => undefined}
      moving={false}
      onToggleMove={() => undefined}
    />
  )

  it('offers the cuts the stone comes in, the colour chart and a size up to 1.5 ct', async () => {
    const onChange = jest.fn()
    const stones = addStone('RING', [], 'SAPPHIRE')
    const tree = await render(panel(stones, onChange))
    await press(pressableWithText(tree, 'אובלי'))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ cutCode: 'OVAL' })])
    await act(async () => {
      tree.root.find((node) => node.props.testID === 'color-LIGHT_ROSE' && node.props.onPress).props.onPress()
    })
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ colorCode: 'LIGHT_ROSE' })])
    await act(async () => {
      slider(tree, 'גודל').props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
    })
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ sizeMm: 5.1 })])
    // The centre stone of a ring moves along the band and turns; it stays on the band's middle.
    expect(() => slider(tree, 'מיקום על התכשיט')).not.toThrow()
    expect(() => slider(tree, 'סיבוב')).not.toThrow()
    expect(() => slider(tree, 'לרוחב הטבעת')).toThrow()
  })

  it('opal only as a cabochon', async () => {
    const tree = await render(panel(addStone('RING', [], 'OPAL'), jest.fn()))
    expect(() => pressableWithText(tree, 'קבושון עגול')).not.toThrow()
    expect(() => pressableWithText(tree, 'אובלי')).toThrow()
  })
})

describe('the elements tab', () => {
  it('a name element takes only letters; the wings come as a pair or one wing', async () => {
    let elements: StudioElement[] = addElement('RING', addElement('RING', [], { elementCode: 'LETTERS' }, 3), { elementCode: 'ANGEL_WINGS' }, 3)
    const onChange = jest.fn((next: StudioElement[]) => {
      elements = next
    })
    const props = {
      itemType: 'RING' as const,
      onChange,
      onAdd: jest.fn(),
      onUpload: jest.fn(),
      offered: [],
      parameters: {},
      bandWidthMm: 3,
      onSelect: jest.fn(),
      moving: false,
      onToggleMove: jest.fn(),
    }
    const tree = await render(<StudioElementPanel {...props} elements={elements} selected={0} />)
    await act(async () => {
      tree.root.find((node) => node.type === TextInput).props.onChangeText('dana 7!')
    })
    expect(elements[0].text).toBe('DANA')
    await act(async () => {
      tree.update(<StudioElementPanel {...props} elements={elements} selected={1} />)
    })
    await press(pressableWithText(tree, 'כנף אחת'))
    expect(elements[1].variant).toBe('SINGLE')
  })
})

describe('the setting tab', () => {
  it('a head, no head, and stones set in a ring band', async () => {
    let value: StudioSetting = { headCode: '', band: null }
    const onChange = jest.fn((next: StudioSetting) => {
      value = next
    })
    const props = { settings: [], itemTypeCode: 'RING' as const, onChange, offeredStones: [] }
    const tree = await render(<StudioSettingPanel {...props} value={value} />)
    await press(pressableWithText(tree, 'חצי משבצת (Half-Bezel)'))
    expect(value.headCode).toBe('HALF_BEZEL')
    await press(pressableWithText(tree, 'פאווה – 2 שורות ומעלה (Pavé)'))
    expect(value.band).toMatchObject({ settingCode: 'PAVE', stoneCode: 'DIAMOND', rows: 2, stoneSizeMm: 1.5 })
    await act(async () => {
      tree.update(<StudioSettingPanel {...props} value={value} />)
    })
    await press(pressableWithText(tree, '3'))
    expect(value.band?.rows).toBe(3)
  })

  it('band styles only on a ring', async () => {
    const tree = await render(
      <StudioSettingPanel settings={[]} itemTypeCode="NECKLACE" value={{ headCode: '', band: null }} onChange={jest.fn()} offeredStones={[]} />,
    )
    expect(() => pressableWithText(tree, 'פאווה – 2 שורות ומעלה (Pavé)')).toThrow()
    expect(() => pressableWithText(tree, 'סל (Basket)')).not.toThrow()
  })
})

describe('placing on the 3D model', () => {
  it('reads where the finger let go; anything else is ignored', () => {
    expect(placementFromMessage('placement:{"kind":"stone","index":1,"angleDeg":200.5,"offsetMm":0.4}')).toEqual({
      kind: 'stone',
      index: 1,
      angleDeg: 200.5,
      offsetMm: 0.4,
    })
    expect(placementFromMessage('placement:{"kind":"metal","index":1,"angleDeg":1,"offsetMm":0}')).toBeNull()
    expect(placementFromMessage('placement:{"kind":"stone","index":1.5,"angleDeg":1,"offsetMm":0}')).toBeNull()
    expect(placementFromMessage('placement:not json')).toBeNull()
    expect(placementFromMessage('ready')).toBeNull()
  })
})
