import { Image, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { ChatQuoteCard } from '../src/components/chats/ChatQuoteCard'
import { DesignSummaryCard } from '../src/components/jeweler/DesignSummaryCard'
import { DesignDetailsCard } from '../src/components/designs/DesignDetailsCard'
import { UserAvatar } from '../src/components/ui/UserAvatar'
import { designPicture } from '../src/lib/designPicture'
import heroRing from '../assets/images/home/hero-ring.png'

// NativeWind's runtime ships untranspiled JSX; plain React renders these components the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
// The icon package ships ES modules only; icons draw nothing in these tests.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))

jest.setTimeout(60_000)

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(element)
  })
  return tree
}

const SAPPHIRE_RING = { previewUrl: '/uploads/preview-9/content?exp=1&sig=ab', itemType: { code: 'RING' } }

describe('a design is pictured by its own picture', () => {
  it('the quote card in a chat shows the picture of the design it prices', async () => {
    const picture = designPicture(SAPPHIRE_RING)
    const tree = await render(
      <ChatQuoteCard
        title="הצעת מחיר"
        spec="טבעת · זהב אדום 18K"
        totalLabel="סה״כ"
        totalValue="₪ 4,500"
        materials="חומרים"
        labor="עבודה"
        delivery="14 ימים"
        ctaLabel="לפרטים"
        image={picture.source}
        imageResizeMode={picture.resizeMode}
      />,
    )
    const [image] = tree.root.findAllByType(Image)
    expect(image.props.source).toEqual({ uri: expect.stringContaining('/uploads/preview-9/content') })
    expect(image.props.source).not.toBe(heroRing)
  })

  it('a design without any picture shows its category illustration at its own size', async () => {
    const picture = designPicture({ itemType: { code: 'NECKLACE' } })
    const tree = await render(
      <DesignSummaryCard sectionTitle="פרטי העיצוב" image={picture.source} imageResizeMode={picture.resizeMode} title="שרשרת" quote="" specs={[]} />,
    )
    const [image] = tree.root.findAllByType(Image)
    expect(image.props.source).toBe(picture.source)
    expect(image.props.resizeMode).toBe('center')
  })

  it("the jeweler's design view shows the designer's inspiration picture under its title", async () => {
    const tree = await render(
      <DesignSummaryCard
        sectionTitle="פרטי העיצוב"
        image={designPicture(SAPPHIRE_RING).source}
        title="טבעת ספיר"
        quote=""
        specs={[]}
        inspiration={{ title: 'תמונת ההשראה', uri: 'https://api.test/uploads/insp-1/content?exp=1&sig=cd' }}
      />,
    )
    const sources = tree.root.findAllByType(Image).map((node) => node.props.source)
    expect(sources).toContainEqual({ uri: 'https://api.test/uploads/insp-1/content?exp=1&sig=cd' })
    expect(tree.root.findAllByType(Text).map((node) => node.props.children)).toContain('תמונת ההשראה')
  })

  it('without an inspiration picture there is no inspiration section', async () => {
    const tree = await render(
      <DesignSummaryCard sectionTitle="פרטי העיצוב" image={designPicture(SAPPHIRE_RING).source} title="טבעת" quote="" specs={[]} />,
    )
    expect(tree.root.findAllByType(Image)).toHaveLength(1)
  })

  it('the full-screen button is offered only for a real picture', async () => {
    const art = designPicture({ itemType: { code: 'RING' } })
    const withoutPicture = await render(
      <DesignDetailsCard sectionTitle="פרטי עיצוב" image={art.source} imageResizeMode={art.resizeMode} title="טבעת" quote="" specs={[]} />,
    )
    expect(withoutPicture.root.findAll((node) => node.props.accessibilityLabel === 'Maximize')).toHaveLength(0)

    const withPicture = await render(
      <DesignDetailsCard sectionTitle="פרטי עיצוב" image={designPicture(SAPPHIRE_RING).source} title="טבעת" quote="" specs={[]} onMaximize={() => undefined} />,
    )
    expect(withPicture.root.findAll((node) => node.props.accessibilityLabel === 'Maximize').length).toBeGreaterThan(0)
  })
})

describe('a person without a photo', () => {
  it('is drawn with their initials, never a stranger', async () => {
    const tree = await render(<UserAvatar name="QA Goldsmith" size={56} />)
    expect(tree.root.findAllByType(Image)).toHaveLength(0)
    expect(tree.root.findByType(Text).props.children).toBe('QG')
  })

  it('with a photo or logo, is drawn with it', async () => {
    const tree = await render(<UserAvatar uri="https://api.test/uploads/logo/content" name="QA Goldsmith" size={56} />)
    expect(tree.root.findByType(Image).props.source).toEqual({ uri: 'https://api.test/uploads/logo/content' })
  })
})
