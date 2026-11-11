import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { ChatAudioBubble } from '../src/components/chats/ChatAudioBubble'
import { ChatBubble } from '../src/components/chats/ChatBubble'
import { ChatImageBubble } from '../src/components/chats/ChatImageBubble'

// NativeWind's runtime ships untranspiled JSX; plain React renders these components the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
// The icon package ships ES modules only; icons draw nothing in these tests.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : () => null) }))
// The voice-note helpers wrap a native recorder; the bubble only formats a duration with them.
jest.mock('../src/lib/voiceNotes', () => ({ formatVoiceDuration: (ms: number) => `${Math.round(ms / 1000)}s` }))

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = renderer.create(element)
  })
  return tree
}

/** The tick's spoken label: "נשלחה" / "נקראה", or null when none is shown. */
function tick(tree: ReactTestRenderer): string | null {
  const labelled = tree.root.findAll((node) => node.props.accessibilityLabel === 'נשלחה' || node.props.accessibilityLabel === 'נקראה')
  // Host and composite nodes both carry the prop: one tick may appear twice in the tree.
  const labels = [...new Set(labelled.map((node) => node.props.accessibilityLabel as string))]
  return labels.length ? labels.join(',') : null
}

/** QA 17.10: a photo or voice note the user sent never showed whether it was read. */
describe('sent and read ticks on every kind of message the user sends', () => {
  it('a photo shows one tick once sent, two once read; an incoming photo shows none', async () => {
    expect(tick(await render(<ChatImageBubble imageUri="https://x.test/a.jpg" time="10:00" side="outgoing" delivery="sent" />))).toBe('נשלחה')
    expect(tick(await render(<ChatImageBubble imageUri="https://x.test/a.jpg" time="10:00" side="outgoing" delivery="read" />))).toBe('נקראה')
    expect(tick(await render(<ChatImageBubble imageUri="https://x.test/a.jpg" time="10:00" side="incoming" delivery="read" />))).toBeNull()
  })

  it('a voice note too', async () => {
    const voice = (side: 'incoming' | 'outgoing', delivery: 'sent' | 'read') => (
      <ChatAudioBubble time="10:00" side={side} playing={false} onTogglePlay={() => undefined} delivery={delivery} />
    )
    expect(tick(await render(voice('outgoing', 'sent')))).toBe('נשלחה')
    expect(tick(await render(voice('outgoing', 'read')))).toBe('נקראה')
    expect(tick(await render(voice('incoming', 'read')))).toBeNull()
  })

  it('a text message keeps its ticks', async () => {
    expect(tick(await render(<ChatBubble text="שלום" time="10:00" side="outgoing" delivery="read" />))).toBe('נקראה')
    expect(tick(await render(<ChatBubble text="שלום" time="10:00" side="incoming" delivery="read" />))).toBeNull()
  })
})
