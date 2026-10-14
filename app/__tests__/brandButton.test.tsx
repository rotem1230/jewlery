import { Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { BrandButton } from '../src/components/ui/BrandButton'

// NativeWind's runtime ships untranspiled JSX; plain React renders these components the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))

describe('button labels', () => {
  it('a long label is never cut off: it shrinks a little, then wraps to a second line', async () => {
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<BrandButton label="צפיה בפריט באטליה" hug />)
    })
    const label = tree.root.findByType(Text)
    expect(label.props.children).toBe('צפיה בפריט באטליה')
    expect(label.props.numberOfLines).toBeGreaterThanOrEqual(2)
    expect(label.props.adjustsFontSizeToFit).toBe(true)
    expect(label.props.minimumFontScale).toBeGreaterThanOrEqual(0.75)
    tree.unmount()
  })
})
