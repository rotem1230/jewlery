import type { TranslationKey } from '@/src/i18n'
import { specsFromDesign, type SpecRow } from '@/src/lib/designSpecs'
import type {
  DesignDetail,
  DesignRequest,
  DesignRequestStatus,
  ItemType,
  Paginated,
  QuoteSummary,
  RequestTargetStatus,
} from '@/src/types/api'

export type OrdersTab = 'all' | 'quote_submitted' | 'negotiating' | 'completed'

/**
 * The orders board tabs (PRD 5.11). Each is filtered on the server (`?tab=`) by this jeweler's own
 * status, so one jeweler quoting does not move a request on the other jewelers' boards.
 */
export const ORDER_TABS: ReadonlyArray<{ id: OrdersTab; labelKey: TranslationKey }> = [
  { id: 'all', labelKey: 'jewelerFilterAll' },
  { id: 'quote_submitted', labelKey: 'jewelerFilterSubmitted' },
  { id: 'negotiating', labelKey: 'jewelerFilterNegotiating' },
  { id: 'completed', labelKey: 'jewelerFilterCompleted' },
]

export type BadgeTone = 'new' | 'active' | 'done' | 'closed'

const BADGES: Record<RequestTargetStatus, { labelKey: TranslationKey; tone: BadgeTone }> = {
  NEW: { labelKey: 'jwStatusNew', tone: 'new' },
  QUOTE_SUBMITTED: { labelKey: 'jwStatusQuoteSubmitted', tone: 'active' },
  NEGOTIATING: { labelKey: 'jwStatusNegotiating', tone: 'active' },
  COMPLETED: { labelKey: 'jwStatusCompleted', tone: 'done' },
  CLOSED: { labelKey: 'jwStatusClosed', tone: 'closed' },
  DECLINED: { labelKey: 'jwStatusDeclined', tone: 'closed' },
}

/** The badge of the jeweler's own status; none when the status is unknown. */
export function orderBadge(
  status: RequestTargetStatus | null | undefined,
): { labelKey: TranslationKey; tone: BadgeTone } | null {
  return status ? BADGES[status] ?? null : null
}

export type OrdersBoard = { items: DesignRequest[]; total: number; hasMore: boolean; nextPage: number }

/**
 * The loaded pages of one tab, in order. An order can move to the next page while paging (a new
 * request arrived), so an order already shown is not listed twice.
 */
export function boardFromPages(pages: ReadonlyArray<Paginated<DesignRequest>>): OrdersBoard {
  const last = pages[pages.length - 1]
  if (!last) return { items: [], total: 0, hasMore: false, nextPage: 1 }
  const seen = new Set<string>()
  const items: DesignRequest[] = []
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
    }
  }
  const { page, totalPages, total } = last.pagination
  return { items, total, hasMore: page < totalPages, nextPage: page + 1 }
}

const OPEN_REQUEST: DesignRequestStatus[] = ['OPEN', 'QUOTE_SUBMITTED', 'NEGOTIATING']

/**
 * The jeweler's own status on a request opened by id (`GET /atelier/requests/:id` lists only this
 * jeweler's own delivery). Mirrors the board: a new order whose request stopped taking quotes, or
 * whose listing ended, is closed.
 */
export function myOrderStatus(request: DesignRequest, now: Date = new Date()): RequestTargetStatus | null {
  if (request.myStatus) return request.myStatus
  const own = request.targets?.[0]?.status
  if (!own) return null
  if (own !== 'NEW') return own
  const design = request.design
  const published = !design?.status || design.status === 'PUBLISHED'
  const expiresAt = design?.expiresAt ? new Date(design.expiresAt) : null
  const live = published && (!expiresAt || expiresAt.getTime() > now.getTime())
  return OPEN_REQUEST.includes(request.status) && live ? 'NEW' : 'CLOSED'
}

/** The quote the jeweler stands behind on a request: the newest pending or accepted one. */
export function currentQuote(quotes: QuoteSummary[] | null | undefined): QuoteSummary | null {
  const standing = (quotes ?? []).filter((quote) => quote.status === 'PENDING' || quote.status === 'ACCEPTED')
  standing.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return standing[0] ?? null
}

export type OrderActions = {
  status: RequestTargetStatus | null
  /** Shown as "the quote I submitted". */
  quote: QuoteSummary | null
  canSubmitQuote: boolean
  canEditQuote: boolean
  canWithdrawQuote: boolean
  canDecline: boolean
}

const IN_PLAY: RequestTargetStatus[] = ['NEW', 'QUOTE_SUBMITTED', 'NEGOTIATING']

/** What the jeweler can do on an order (PRD 8: quote, edit or withdraw the quote, decline). */
export function orderActions(request: DesignRequest, now: Date = new Date()): OrderActions {
  const status = myOrderStatus(request, now)
  const quote = currentQuote(request.quotes)
  const pending = quote?.status === 'PENDING'
  return {
    status,
    quote,
    canSubmitQuote: !quote && status === 'NEW',
    canEditQuote: pending,
    canWithdrawQuote: pending,
    canDecline: status !== null && IN_PLAY.includes(status),
  }
}

type DesignForSpecs = {
  itemType?: ItemType | null
  parameters?: Record<string, unknown> | null
  jewelerNotes?: string | null
}

/** The full specification of a design: item type, every parameter, and the notes for the jeweler. */
export function designSpecRows(design: DesignForSpecs | null | undefined): SpecRow[] {
  if (!design) return []
  // specsFromDesign reads only the item type, the parameters and the jeweler notes.
  return specsFromDesign({
    itemType: design.itemType ?? null,
    parameters: design.parameters ?? {},
    jewelerNotes: design.jewelerNotes ?? null,
  } as DesignDetail)
}
