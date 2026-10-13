import {
  conversationPreview,
  conversationRow,
  inboxHasMore,
  inboxParams,
  inboxReducer,
  initialInboxState,
  mergeFilterOptions,
  type InboxState,
} from '../src/lib/inbox'
import type { ChatMessage, ConversationItem, Paginated } from '../src/types/api'

function message(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u2',
    type: 'TEXT',
    body: null,
    imageUploadId: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...over,
  }
}

function conversation(id: string, over: Partial<ConversationItem> = {}): ConversationItem {
  return {
    id,
    designId: `d-${id}`,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    lastMessageAt: '2026-10-01T10:00:00.000Z',
    design: { id: `d-${id}`, title: `Design ${id}`, thumbnailUploadId: null, status: 'PUBLISHED' },
    participants: [
      { id: `p-me-${id}`, conversationId: id, userId: 'me', lastReadAt: null, user: { id: 'me', firstName: 'Me', lastName: null, avatarUploadId: null } },
      { id: `p-peer-${id}`, conversationId: id, userId: `peer-${id}`, lastReadAt: null, user: { id: `peer-${id}`, firstName: 'Yossi', lastName: 'Barak', avatarUploadId: null } },
    ],
    lastMessage: null,
    unreadCount: 0,
    ...over,
  }
}

function page(ids: string[], pageNo: number, totalPages: number): Paginated<ConversationItem> {
  return { items: ids.map((id) => conversation(id)), pagination: { page: pageNo, pageSize: 20, total: totalPages * 20, totalPages } }
}

const ids = (state: InboxState) => state.items.map((item) => item.id)

describe('inbox query (server-side search and filters)', () => {
  it('sends the trimmed search and the active filter, and the page only past the first', () => {
    expect(inboxParams({ q: '  טבעת ', peerUserId: 'p1' }, 1)).toEqual({ q: 'טבעת', peerUserId: 'p1' })
    expect(inboxParams({ q: '   ', designId: 'd1', from: '2026-10-01T00:00:00.000Z' }, 3)).toEqual({
      designId: 'd1',
      from: '2026-10-01T00:00:00.000Z',
      page: 3,
    })
  })
})

describe('inbox pages', () => {
  it('a new query replaces the list and knows whether more pages exist', () => {
    let state = inboxReducer(initialInboxState, { type: 'query' })
    expect(state.status).toBe('loading')
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'replace', response: page(['a', 'b'], 1, 2) })
    expect(ids(state)).toEqual(['a', 'b'])
    expect(state.status).toBe('ready')
    expect(inboxHasMore(state)).toBe(true)
  })

  it('"load more" appends the next page without duplicates and stops at the last page', () => {
    let state = inboxReducer(initialInboxState, { type: 'query' })
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'replace', response: page(['a', 'b'], 1, 2) })
    state = inboxReducer(state, { type: 'more' })
    expect(state.loadingMore).toBe(true)
    // A conversation moved down a page while the user was reading: it is not listed twice.
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'append', response: page(['b', 'c'], 2, 2) })
    expect(ids(state)).toEqual(['a', 'b', 'c'])
    expect(state.loadingMore).toBe(false)
    expect(inboxHasMore(state)).toBe(false)
  })

  it('a refresh updates the first page and keeps the pages already loaded', () => {
    let state = inboxReducer(initialInboxState, { type: 'query' })
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'replace', response: page(['a', 'b'], 1, 3) })
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'append', response: page(['c', 'd'], 2, 3) })
    state = inboxReducer(state, { type: 'refresh' })
    expect(state.refreshing).toBe(true)
    // "c" got a new message and moved to the top.
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'refresh', response: page(['c', 'a'], 1, 3) })
    expect(ids(state)).toEqual(['c', 'a', 'b', 'd'])
    expect(state.page).toBe(2)
    expect(state.refreshing).toBe(false)
    expect(inboxHasMore(state)).toBe(true)
  })

  it('an answer for an older search is ignored once the user typed a new one', () => {
    let state = inboxReducer(initialInboxState, { type: 'query' })
    const stale = state.generation
    state = inboxReducer(state, { type: 'query' })
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'replace', response: page(['new'], 1, 1) })
    state = inboxReducer(state, { type: 'loaded', generation: stale, mode: 'replace', response: page(['old'], 1, 1) })
    state = inboxReducer(state, { type: 'failed', generation: stale, mode: 'replace', error: new Error('late') })
    expect(ids(state)).toEqual(['new'])
    expect(state.error).toBeNull()
  })

  it('a failed first load is an error; a failed refresh or "load more" keeps the list', () => {
    let state = inboxReducer(initialInboxState, { type: 'query' })
    state = inboxReducer(state, { type: 'failed', generation: state.generation, mode: 'replace', error: new Error('offline') })
    expect(state.status).toBe('error')

    state = inboxReducer(state, { type: 'query' })
    state = inboxReducer(state, { type: 'loaded', generation: state.generation, mode: 'replace', response: page(['a'], 1, 2) })
    state = inboxReducer(state, { type: 'more' })
    state = inboxReducer(state, { type: 'failed', generation: state.generation, mode: 'append', error: new Error('offline') })
    expect(state.status).toBe('ready')
    expect(state.loadingMore).toBe(false)
    expect(ids(state)).toEqual(['a'])
  })
})

describe('inbox row status snippet', () => {
  it('names quote cards by their status instead of an empty preview', () => {
    const quote = { id: 'q1', totalPrice: '4500', currency: 'ILS', status: 'PENDING' }
    expect(conversationPreview(message({ type: 'QUOTE_CARD', quote: quote as never }))).toBe('הצעת מחיר נשלחה · ₪ 4,500')
    expect(conversationPreview(message({ type: 'QUOTE_CARD', quote: { ...quote, status: 'ACCEPTED' } as never }))).toBe(
      'הצעת המחיר אושרה · ₪ 4,500',
    )
    expect(conversationPreview(message({ type: 'QUOTE_CARD', quote: { ...quote, status: 'DECLINED' } as never }))).toBe(
      'הצעת המחיר נדחתה · ₪ 4,500',
    )
    expect(conversationPreview(message({ type: 'QUOTE_CARD', quoteId: 'q1' }))).toBe('הצעת מחיר נשלחה')
  })

  it('shows system text, media labels and message text', () => {
    expect(conversationPreview(message({ type: 'SYSTEM', senderId: null, body: 'הצעת המחיר אושרה' }))).toBe('הצעת המחיר אושרה')
    expect(conversationPreview(message({ type: 'SYSTEM', senderId: null, body: null }))).toBe('עדכון מהמערכת')
    expect(conversationPreview(message({ type: 'IMAGE', imageUploadId: 'u1' }))).toBe('תמונה')
    expect(conversationPreview(message({ type: 'AUDIO', imageUploadId: 'u1' }))).toBe('הודעה קולית')
    expect(conversationPreview(message({ body: 'אפשר לתאם שיחה?' }))).toBe('אפשר לתאם שיחה?')
    expect(conversationPreview(null)).toBe('עדיין אין הודעות')
  })

  it('names the other participant, or a neutral label — never a sample name', () => {
    const row = conversationRow(conversation('a', { unreadCount: 2 }), 'me', 'he')
    expect(row).toMatchObject({ id: 'a', name: 'Yossi Barak', peerUserId: 'peer-a', design: 'Design a', unread: 2 })

    const nameless = conversation('b')
    nameless.participants[1].user = { id: 'peer-b', firstName: null, lastName: null, avatarUploadId: null }
    expect(conversationRow(nameless, 'me', 'he').name).toBe('משתמש/ת')
  })
})

describe('filter options', () => {
  it('collects every design and person seen, so a filter can be changed after one is applied', () => {
    const first = mergeFilterOptions({ designs: [], peers: [] }, [
      conversationRow(conversation('a'), 'me', 'he'),
      conversationRow(conversation('b'), 'me', 'he'),
    ])
    const next = mergeFilterOptions(first, [conversationRow(conversation('a'), 'me', 'he')])
    expect(next.designs.map((option) => option.id)).toEqual(['d-a', 'd-b'])
    expect(next.peers).toEqual([
      { id: 'peer-a', label: 'Yossi Barak' },
      { id: 'peer-b', label: 'Yossi Barak' },
    ])
    expect(mergeFilterOptions(next, [conversationRow(conversation('a'), 'me', 'he')])).toBe(next)
  })
})
