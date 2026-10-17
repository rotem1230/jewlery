/**
 * Conversation inbox: server-side search / filters, page-by-page loading and the row snippet.
 * The reducer keeps the paging rules pure (and testable); `useConversations` only does I/O.
 */
import type { ListConversationsParams } from '@/src/api/chat'
import { t, type TranslationKey } from '@/src/i18n'
import { formatChatTime } from '@/src/lib/chatTime'
import { currencySymbol, formatMoney } from '@/src/lib/format'
import { personName, personPhotoUri } from '@/src/lib/people'
import type { ChatMessage, ConversationItem, Paginated } from '@/src/types/api'

export type InboxFilters = {
  q?: string
  designId?: string
  peerUserId?: string
  from?: string
  to?: string
}

/** Query string for `GET /conversations`: blank values are left out, page 1 is the default. */
export function inboxParams(filters: InboxFilters, page: number): ListConversationsParams {
  const params: ListConversationsParams = {}
  const q = filters.q?.trim()
  if (q) params.q = q
  if (filters.designId) params.designId = filters.designId
  if (filters.peerUserId) params.peerUserId = filters.peerUserId
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = filters.to
  if (page > 1) params.page = page
  return params
}

export type InboxState = {
  /** Bumped by every new search / filter: answers for an older one are dropped. */
  generation: number
  items: ConversationItem[]
  /** Highest page loaded so far. */
  page: number
  totalPages: number
  status: 'loading' | 'ready' | 'error'
  refreshing: boolean
  loadingMore: boolean
  error: Error | null
}

export type InboxLoadMode = 'replace' | 'refresh' | 'append'

export type InboxAction =
  | { type: 'query' }
  | { type: 'refresh' }
  | { type: 'more' }
  | { type: 'loaded'; generation: number; mode: InboxLoadMode; response: Paginated<ConversationItem> }
  | { type: 'failed'; generation: number; mode: InboxLoadMode; error: Error }

export const initialInboxState: InboxState = {
  generation: 0,
  items: [],
  page: 0,
  totalPages: 0,
  status: 'loading',
  refreshing: false,
  loadingMore: false,
  error: null,
}

function withoutIds(items: ConversationItem[], ids: Set<string>): ConversationItem[] {
  return items.filter((item) => !ids.has(item.id))
}

export function inboxReducer(state: InboxState, action: InboxAction): InboxState {
  switch (action.type) {
    case 'query':
      // The list on screen stays until the new answer replaces it (no flicker while typing).
      return { ...state, generation: state.generation + 1, status: 'loading', refreshing: false, loadingMore: false, error: null }
    case 'refresh':
      return { ...state, refreshing: true }
    case 'more':
      return { ...state, loadingMore: true }
    case 'loaded': {
      if (action.generation !== state.generation) return state
      const { items, pagination } = action.response
      const fresh = new Set(items.map((item) => item.id))
      if (action.mode === 'replace') {
        return { ...state, items, page: pagination.page, totalPages: pagination.totalPages, status: 'ready', refreshing: false, error: null }
      }
      if (action.mode === 'refresh') {
        // Page 1 again: its conversations move to the top, the pages loaded below stay.
        return {
          ...state,
          items: [...items, ...withoutIds(state.items, fresh)],
          page: Math.max(state.page, pagination.page),
          totalPages: pagination.totalPages,
          status: 'ready',
          refreshing: false,
          error: null,
        }
      }
      const known = new Set(state.items.map((item) => item.id))
      return {
        ...state,
        items: [...state.items, ...withoutIds(items, known)],
        page: Math.max(state.page, pagination.page),
        totalPages: pagination.totalPages,
        loadingMore: false,
      }
    }
    case 'failed':
      if (action.generation !== state.generation) return state
      if (action.mode === 'append') return { ...state, loadingMore: false }
      if (action.mode === 'refresh') return { ...state, refreshing: false, error: action.error }
      return { ...state, status: 'error', refreshing: false, error: action.error }
  }
}

export function inboxHasMore(state: InboxState): boolean {
  return state.status === 'ready' && state.page > 0 && state.page < state.totalPages
}

const QUOTE_STATUS_PREVIEW: Record<string, TranslationKey> = {
  PENDING: 'shChatPreviewQuoteSent',
  ACCEPTED: 'shChatPreviewQuoteAccepted',
  DECLINED: 'shChatPreviewQuoteDeclined',
  EXPIRED: 'shChatPreviewQuoteExpired',
  WITHDRAWN: 'shChatPreviewQuoteWithdrawn',
}

/** One-line status of a conversation: its last message, a quote card's state, or "no messages yet". */
export function conversationPreview(last: ChatMessage | null): string {
  if (!last) return t('shChatPreviewEmpty')
  switch (last.type) {
    case 'IMAGE':
      return t('chatPreviewImage')
    case 'AUDIO':
      return t('chatPreviewAudio')
    case 'SYSTEM':
      return last.body?.trim() || t('shChatPreviewSystem')
    case 'QUOTE_CARD': {
      const quote = last.quote
      const label = t(QUOTE_STATUS_PREVIEW[quote?.status ?? 'PENDING'] ?? 'shChatPreviewQuoteSent')
      return quote?.totalPrice != null ? `${label} · ${formatMoney(quote.totalPrice, currencySymbol(quote.currency))}` : label
    }
    default:
      return last.body ?? ''
  }
}

export type InboxRow = {
  id: string
  /** The other side: a jeweler by business name, a designer by their own name. */
  name: string
  /** Their photo or business logo; none → the row draws their initials. */
  avatarUri?: string
  design: string
  designId: string
  peerUserId: string | null
  preview: string
  time: string
  unread: number
  /** Kept for the thread: read ticks start from the other side's last read. */
  peerLastReadAt: string | null
}

export function conversationRow(conv: ConversationItem, myUserId: string | undefined, locale: string): InboxRow {
  const peerParticipant = conv.participants.find((p) => p.userId !== myUserId) ?? conv.participants[0]
  const peer = peerParticipant?.user
  return {
    id: conv.id,
    name: personName(peer, t('shChatPeerFallback')),
    avatarUri: personPhotoUri(peer),
    design: conv.design.title ?? '',
    designId: conv.designId,
    peerUserId: peer?.id ?? null,
    preview: conversationPreview(conv.lastMessage),
    time: formatChatTime(conv.lastMessageAt, locale),
    unread: conv.unreadCount,
    peerLastReadAt: peerParticipant && peerParticipant.userId !== myUserId ? peerParticipant.lastReadAt : null,
  }
}

export type FilterChoice = { id: string; label: string }
export type InboxFilterOptions = { designs: FilterChoice[]; peers: FilterChoice[] }

/**
 * Designs and people seen in any loaded page, so the filter sheet still lists them after a
 * filter narrowed the list. Returns `prev` itself when nothing new was seen.
 */
export function mergeFilterOptions(prev: InboxFilterOptions, rows: InboxRow[]): InboxFilterOptions {
  const designs = [...prev.designs]
  const peers = [...prev.peers]
  const designIds = new Set(designs.map((option) => option.id))
  const peerIds = new Set(peers.map((option) => option.id))
  for (const row of rows) {
    if (row.design && !designIds.has(row.designId)) {
      designIds.add(row.designId)
      designs.push({ id: row.designId, label: row.design })
    }
    if (row.peerUserId && !peerIds.has(row.peerUserId)) {
      peerIds.add(row.peerUserId)
      peers.push({ id: row.peerUserId, label: row.name })
    }
  }
  if (designs.length === prev.designs.length && peers.length === prev.peers.length) return prev
  return { designs, peers }
}
