import { StyleSheet } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { Button } from '../src/components/ui/Button'
import { IconButton } from '../src/components/ui/IconButton'

// NativeWind's runtime ships untranspiled JSX; plain React renders these components the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))

/**
 * QA 17.10: after a ring size was picked, "מעבר לעיצוב" stayed faded as if disabled (it worked when
 * tapped). The faded look came from a className toggled with `disabled`, which NativeWind kept. The
 * look now follows `disabled` through a plain style, which React Native applies on every render.
 */
describe('button disabled look', () => {
  /** The pressable the Button renders: the node that takes its classes. */
  const pressable = (tree: ReactTestRenderer) => tree.root.findAll((node) => typeof node.props.className === 'string')[0]
  const opacityOf = (tree: ReactTestRenderer) => StyleSheet.flatten(pressable(tree).props.style)?.opacity

  it('is faded exactly while disabled, by a plain style, not a toggled class', async () => {
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<Button disabled>מעבר לעיצוב</Button>)
    })
    expect(opacityOf(tree)).toBe(0.5)
    expect(pressable(tree).props.disabled).toBe(true)

    await act(async () => {
      tree.update(<Button disabled={false}>מעבר לעיצוב</Button>)
    })
    expect(opacityOf(tree)).toBeUndefined()
    expect(pressable(tree).props.disabled).toBe(false)
    // The class list is the same either way: nothing for the styling runtime to keep stale.
    expect(pressable(tree).props.className).not.toContain('opacity')
  })

  it('the icon button the same way', async () => {
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<IconButton disabled>{null}</IconButton>)
    })
    expect(opacityOf(tree)).toBe(0.5)
    await act(async () => {
      tree.update(<IconButton>{null}</IconButton>)
    })
    expect(opacityOf(tree)).toBeUndefined()
    expect(pressable(tree).props.className).not.toContain('opacity')
  })
})
