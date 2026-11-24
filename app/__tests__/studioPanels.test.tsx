import { Text, TextInput, View } from 'react-native'
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StudioElementPanel } from '../src/components/studio/StudioElementPanel'
import { StudioSettingPanel } from '../src/components/studio/StudioSettingPanel'
import { StudioStonePanel } from '../src/components/studio/StudioStonePanel'
import { placementFromMessage, StudioViewer } from '../src/components/studio/StudioViewer'
import { StudioSizePanel } from '../src/components/studio/StudioSizePanel'
import { addElement, addStone, newBand, type StudioElement, type StudioSetting, type StudioSize, type StudioStone } from '../src/lib/studioParams'

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
    expect(() => slider(tree, 'הזזה סביב הטבעת')).not.toThrow()
    expect(() => slider(tree, 'סיבוב על הציר')).not.toThrow()
    expect(() => slider(tree, 'הזזה לרוחב הטבעת')).toThrow()
  })

  it('opal only as a cabochon', async () => {
    const tree = await render(panel(addStone('RING', [], 'OPAL'), jest.fn()))
    expect(() => pressableWithText(tree, 'קבושון עגול')).not.toThrow()
    expect(() => pressableWithText(tree, 'אובלי')).toThrow()
  })

  it('a stone only in its own colours: a diamond white / clear, no effects (notes of 23.11)', async () => {
    const swatches = (tree: ReactTestRenderer) =>
      tree.root
        .findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('color-') && node.props.onPress)
        .map((node) => node.props.testID)
    const diamond = await render(panel(addStone('RING', [], 'DIAMOND'), jest.fn()))
    expect(swatches(diamond)).toEqual(['color-CRYSTAL'])
    expect(() => pressableWithText(diamond, 'אפקטים')).toThrow()
    const sapphire = await render(panel(addStone('RING', [], 'SAPPHIRE'), jest.fn()))
    expect(swatches(sapphire)).toContain('color-SAPPHIRE')
    expect(swatches(sapphire)).not.toContain('color-RUBY')
  })

  it('the fancy shapes are offered, not only round and oval', async () => {
    const tree = await render(panel(addStone('RING', [], 'SAPPHIRE'), jest.fn()))
    for (const label of ['פרינסס (ריבוע)', 'טיפה (Pear)', 'מרקיזה (Marquise)', 'לב (Heart)', 'באגט (Baguette)']) {
      expect(() => pressableWithText(tree, label)).not.toThrow()
    }
  })

  it('"add a stone" says what it adds', async () => {
    const tree = await render(panel(addStone('RING', [], 'SAPPHIRE'), jest.fn()))
    expect(() => pressableWithText(tree, '+ הוספת אבן נוספת לתכשיט')).not.toThrow()
  })

  it('the stones set in the band are chosen here, in a section of their own', async () => {
    const onBandChange = jest.fn()
    const tree = await render(
      <StudioStonePanel
        itemType="RING"
        stones={addStone('RING', [], 'SAPPHIRE')}
        onChange={jest.fn()}
        offered={[]}
        parameters={{ stones: [{ stoneCode: 'SAPPHIRE' }] }}
        bandWidthMm={4}
        selected={0}
        onSelect={() => undefined}
        moving={false}
        onToggleMove={() => undefined}
        band={newBand('PAVE')}
        bandName="פאווה"
        onBandChange={onBandChange}
      />,
    )
    const section = tree.root.find((node) => node.props.testID === 'band-stones')
    const ruby = section.findAll((node) => node.type === Text && node.props.children === 'רובי / אודם')[0]
    let node: ReactTestInstance | null = ruby
    while (node && typeof node.props.onPress !== 'function') node = node.parent
    await press(node!)
    expect(onBandChange).toHaveBeenLastCalledWith(expect.objectContaining({ settingCode: 'PAVE', stoneCode: 'RUBY', colorCode: 'RUBY' }))
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

  it('clear sections: the elements on the piece (each with its own remove), then adding one; plain slider names', async () => {
    let elements: StudioElement[] = addElement('RING', addElement('RING', [], { elementCode: 'HEART' }, 3), { elementCode: 'STAR' }, 3)
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
    const all = tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))
    expect(all).toContain('האלמנטים בתכשיט')
    expect(all).toContain('הוספת אלמנט')
    expect(() => slider(tree, 'הזזה סביב הטבעת')).not.toThrow()
    expect(() => slider(tree, 'הזזה לרוחב הטבעת')).not.toThrow()
    expect(() => slider(tree, 'סיבוב על הציר')).not.toThrow()
    // The star (the second element) is removed by its own button.
    const remove = tree.root.find(
      (node) => node.props.accessibilityLabel === 'הסרת כוכב (5 קודקודים)' && typeof node.props.onPress === 'function',
    )
    await press(remove)
    expect(elements.map((element) => element.elementCode)).toEqual(['HEART'])
  })

  it('on a stud with a stone, an element is centred behind the stone in one tap (the notes of 24.11)', async () => {
    let elements: StudioElement[] = addElement('EARRINGS', [], { elementCode: 'FLOWER' }, 3)
    const onChange = jest.fn((next: StudioElement[]) => {
      elements = next
    })
    const props = {
      itemType: 'EARRINGS' as const,
      onChange,
      onAdd: jest.fn(),
      onUpload: jest.fn(),
      offered: [],
      bandWidthMm: 3,
      onSelect: jest.fn(),
      moving: false,
      onToggleMove: jest.fn(),
    }
    const stud = { size: { earringStyleCode: 'stud' }, stones: [{ stoneCode: 'SAPPHIRE' }] }
    const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))
    const tree = await render(<StudioElementPanel {...props} parameters={stud} elements={elements} selected={0} />)
    // Not placed yet: the distance is automatic (beside the stone).
    expect(texts(tree)).toContain('אוטומטי')
    // Turning it around the stone first (no distance yet) keeps it beside the stone, not behind it.
    await act(async () => {
      slider(tree, 'הזזה לאורך התכשיט').props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
    })
    expect(typeof elements[0].placement.angleDeg).toBe('number')
    expect(elements[0].placement.behindHead).toBeUndefined()
    await act(async () => {
      tree.update(<StudioElementPanel {...props} parameters={stud} elements={elements} selected={0} />)
    })
    expect(texts(tree)).toContain('אוטומטי')
    await press(pressableWithText(tree, 'למרכז, מאחורי האבן'))
    expect(elements[0].placement).toMatchObject({ offsetMm: 0, behindHead: true })
    await act(async () => {
      tree.update(<StudioElementPanel {...props} parameters={stud} elements={elements} selected={0} />)
    })
    expect(texts(tree)).toContain('במרכז, מאחורי האבן')
    // Moving it out again takes it from behind the stone.
    await act(async () => {
      slider(tree, 'מרחק מהמרכז').props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
    })
    expect(elements[0].placement.behindHead).toBeUndefined()
    expect(elements[0].placement.offsetMm).toBeGreaterThan(0)
    // An earring without a stone: the element is its face, nothing to centre behind.
    const plain = await render(<StudioElementPanel {...props} parameters={{ size: { earringStyleCode: 'stud' } }} elements={elements} selected={0} />)
    expect(texts(plain)).not.toContain('למרכז, מאחורי האבן')
  })
})

describe('the setting tab', () => {
  it('heads and band styles only; the band\'s stones are chosen in the stone tab; a note on side stones', async () => {
    const value: StudioSetting = { headCode: 'BASKET', band: newBand('PAVE') }
    const tree = await render(<StudioSettingPanel settings={[]} itemTypeCode="RING" value={value} onChange={jest.fn()} offeredStones={[]} />)
    expect(() => pressableWithText(tree, 'רובי / אודם')).toThrow()
    const all = tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))
    expect(all.some((line) => line.includes('שיבוץ אבנים בצדדים'))).toBe(true)
  })

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

  it('a split shank with side stones chosen before: they can be removed right here', async () => {
    const onChange = jest.fn()
    const value: StudioSetting = { headCode: 'BASKET', band: newBand('PAVE') }
    const tree = await render(
      <StudioSettingPanel settings={[]} itemTypeCode="RING" value={value} onChange={onChange} offeredStones={[]} shankStyle="SPLIT" />,
    )
    const all = tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))
    // The note that side stones can be added is not shown when they cannot.
    expect(all.some((line) => line.includes('אפשר להוסיף גם שיבוץ אבנים בצדדים'))).toBe(false)
    await press(pressableWithText(tree, 'הסרת השיבוץ בצדי הטבעת'))
    expect(onChange).toHaveBeenLastCalledWith({ ...value, band: null })
  })

  it('band styles only on a ring', async () => {
    const tree = await render(
      <StudioSettingPanel settings={[]} itemTypeCode="NECKLACE" value={{ headCode: '', band: null }} onChange={jest.fn()} offeredStones={[]} />,
    )
    expect(() => pressableWithText(tree, 'פאווה – 2 שורות ומעלה (Pavé)')).toThrow()
    expect(() => pressableWithText(tree, 'סל (Basket)')).not.toThrow()
  })
})

describe('the size tab (notes of 23.11)', () => {
  const size: StudioSize = { standard: 'IL', sizeCode: '54', bandWidthMm: 3 }
  const sizePanel = (props: Partial<React.ComponentProps<typeof StudioSizePanel>> = {}) => (
    <StudioSizePanel itemType="RING" charts={[]} value={size} onChange={jest.fn()} onMeasureGuide={jest.fn()} {...props} />
  )

  it('the ring size can be changed: every size, or one typed in', async () => {
    const onChange = jest.fn()
    const tree = await render(sizePanel({ onChange }))
    await press(pressableWithText(tree, '55'))
    expect(onChange).toHaveBeenLastCalledWith({ ...size, standard: 'IL', sizeCode: '55' })
    await act(async () => {
      tree.root.find((node) => node.type === TextInput && node.props.testID === 'custom-ring-size').props.onChangeText('55.5')
    })
    expect(onChange).toHaveBeenLastCalledWith({ ...size, standard: 'IL', sizeCode: '55.5' })
  })

  it('the shank: one band, split, double or triple', async () => {
    const onChange = jest.fn()
    const tree = await render(sizePanel({ onChange }))
    await press(pressableWithText(tree, 'שינה מפוצלת'))
    expect(onChange).toHaveBeenLastCalledWith({ ...size, shankStyle: 'SPLIT' })
    await press(pressableWithText(tree, 'שלוש שינות'))
    expect(onChange).toHaveBeenLastCalledWith({ ...size, shankStyle: 'TRIPLE' })
  })

  it('a size locked before shows how to open it; nothing changes until it is opened', async () => {
    const onChange = jest.fn()
    const onUnlock = jest.fn()
    const tree = await render(sizePanel({ onChange, locked: true, onUnlock }))
    await press(pressableWithText(tree, '55'))
    expect(onChange).not.toHaveBeenCalled()
    await press(pressableWithText(tree, 'פתיחת הנעילה'))
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })
})

describe('the 3D view (notes of 23.11)', () => {
  it('front, side and top buttons turn the model to that view', async () => {
    const inject = jest.fn()
    let tree!: ReactTestRenderer
    await act(async () => {
      // The WebView mock is a host element: its ref is what the viewer sends through.
      tree = renderer.create(<StudioViewer parameters={{}} />, {
        createNodeMock: (element) => ((element.type as unknown) === 'WebView' ? { injectJavaScript: inject } : null),
      })
    })
    const web = tree.root.find((node) => (node.type as unknown) === 'WebView')
    await act(async () => web.props.onMessage({ nativeEvent: { data: 'ready' } }))
    for (const [label, view] of [
      ['חזית', 'front'],
      ['צד', 'side'],
      ['מבט על', 'top'],
    ]) {
      await press(pressableWithText(tree, label))
      expect(inject).toHaveBeenLastCalledWith(expect.stringContaining(`"type":"view","view":"${view}"`))
    }
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
    // Let go over a stud's stone head: behind it (only a real true counts).
    expect(placementFromMessage('placement:{"kind":"element","index":0,"angleDeg":10,"offsetMm":0,"behindHead":true}')).toEqual({
      kind: 'element',
      index: 0,
      angleDeg: 10,
      offsetMm: 0,
      behindHead: true,
    })
    expect(placementFromMessage('placement:{"kind":"element","index":0,"angleDeg":10,"offsetMm":0,"behindHead":"yes"}')).not.toHaveProperty('behindHead')
    expect(placementFromMessage('placement:{"kind":"metal","index":1,"angleDeg":1,"offsetMm":0}')).toBeNull()
    expect(placementFromMessage('placement:{"kind":"stone","index":1.5,"angleDeg":1,"offsetMm":0}')).toBeNull()
    expect(placementFromMessage('placement:not json')).toBeNull()
    expect(placementFromMessage('ready')).toBeNull()
  })
})

describe('combining elements (notes of 24.11)', () => {
  it('a name is put in the middle of a Star of David in one tap; then only its turn is left to set', async () => {
    let elements: StudioElement[] = addElement('NECKLACE', addElement('NECKLACE', [], { elementCode: 'STAR_OF_DAVID' }, 3), { elementCode: 'LETTERS' }, 3)
    elements = elements.map((element, i) => (i === 0 ? { ...element, sizeMm: 16 } : { ...element, text: 'DANA', sizeMm: 10 }))
    const onChange = jest.fn((next: StudioElement[]) => {
      elements = next
    })
    const props = {
      itemType: 'NECKLACE' as const,
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
    const tree = await render(<StudioElementPanel {...props} elements={elements} selected={1} />)
    await press(pressableWithText(tree, 'בתוך מגן דוד'))
    expect(elements[1].placement.onElement).toBe(0)
    // Too big for the star (10 of 16 mm): made to fit inside it.
    expect(elements[1].sizeMm).toBe(7)
    await act(async () => {
      tree.update(<StudioElementPanel {...props} elements={elements} selected={1} />)
    })
    const texts = tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''))
    expect(texts).toContain('במרכז מגן דוד')
    expect(() => slider(tree, 'הזזה לאורך התכשיט')).toThrow()
    expect(() => slider(tree, 'סיבוב על הציר')).not.toThrow()
    // And back on its own.
    await press(pressableWithText(tree, 'בנפרד'))
    expect(elements[1].placement.onElement).toBeUndefined()
  })
  it('on a stud with no stone, the element left standing is the face: when the first one is put on it, the second gets no sliders to move it', async () => {
    const heart = addElement('EARRINGS', [], { elementCode: 'HEART' }, 3)[0]
    const flower = addElement('EARRINGS', [], { elementCode: 'FLOWER' }, 3)[0]
    const elements: StudioElement[] = [{ ...heart, placement: { ...heart.placement, onElement: 1 } }, flower]
    const props = {
      itemType: 'EARRINGS' as const,
      onChange: jest.fn(),
      onAdd: jest.fn(),
      onUpload: jest.fn(),
      offered: [],
      parameters: { size: { earringStyleCode: 'stud' } },
      bandWidthMm: 3,
      onSelect: jest.fn(),
      moving: false,
      onToggleMove: jest.fn(),
    }
    const tree = await render(<StudioElementPanel {...props} elements={elements} selected={1} />)
    expect(() => slider(tree, 'הזזה לאורך התכשיט')).toThrow()
    expect(() => slider(tree, 'מרחק מהמרכז')).toThrow()
    expect(() => slider(tree, 'סיבוב על הציר')).not.toThrow()
  })
})
