import {
  ORDER_TABS,
  boardFromPages,
  currentQuote,
  designSpecRows,
  myOrderStatus,
  orderActions,
  orderBadge,
} from '../src/lib/jewelerOrders'
import type { DesignRequest, Paginated, QuoteSummary } from '../src/types/api'

const NOW = new Date('2026-10-13T10:00:00.000Z')

function request(over: Partial<DesignRequest> = {}): DesignRequest {
  return {
    id: 'r1',
    designId: 'd1',
    requesterId: 'u1',
    mode: 'TARGETED',
    status: 'OPEN',
    message: null,
    createdAt: '2026-10-10T10:00:00.000Z',
    design: { id: 'd1', title: 'Solitaire', thumbnailUploadId: null, status: 'PUBLISHED', expiresAt: '2026-11-01T00:00:00.000Z' },
    targets: [{ jewelerProfileId: 'p1', status: 'NEW' }],
    quotes: [],
    ...over,
  }
}

function quote(over: Partial<QuoteSummary> = {}): QuoteSummary {
  return {
    id: 'q1',
    conversationId: 'c1',
    designId: 'd1',
    authorUserId: 'j1',
    materialsCost: '100',
    laborCost: '50',
    totalPrice: '150',
    currency: 'ILS',
    etaBusinessDays: 14,
    status: 'PENDING',
    createdAt: '2026-10-11T10:00:00.000Z',
    ...over,
  }
}

function page(items: DesignRequest[], pageNo: number, totalPages: number, total: number): Paginated<DesignRequest> {
  return { items, pagination: { page: pageNo, pageSize: 20, total, totalPages } }
}

describe('orders board tabs (PRD 5.11)', () => {
  it('filters on the server by the jeweler’s own status', () => {
    expect(ORDER_TABS.map((tab) => tab.id)).toEqual(['all', 'quote_submitted', 'negotiating', 'completed'])
  })

  it('labels every own status, never the request-wide one', () => {
    expect(orderBadge('NEW')).toEqual({ labelKey: 'jwStatusNew', tone: 'new' })
    expect(orderBadge('QUOTE_SUBMITTED')).toEqual({ labelKey: 'jwStatusQuoteSubmitted', tone: 'active' })
    expect(orderBadge('NEGOTIATING')).toEqual({ labelKey: 'jwStatusNegotiating', tone: 'active' })
    expect(orderBadge('COMPLETED')).toEqual({ labelKey: 'jwStatusCompleted', tone: 'done' })
    expect(orderBadge('CLOSED')).toEqual({ labelKey: 'jwStatusClosed', tone: 'closed' })
    expect(orderBadge('DECLINED')).toEqual({ labelKey: 'jwStatusDeclined', tone: 'closed' })
  })

  it('shows no badge rather than guessing when the own status is missing', () => {
    expect(orderBadge(undefined)).toBeNull()
  })
})

describe('orders board pages', () => {
  it('appends the next pages, without repeating an order that moved between pages', () => {
    const board = boardFromPages([
      page([request({ id: 'a' }), request({ id: 'b' })], 1, 3, 5),
      page([request({ id: 'b' }), request({ id: 'c' })], 2, 3, 5),
    ])
    expect(board.items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(board.total).toBe(5)
    expect(board.hasMore).toBe(true)
    expect(board.nextPage).toBe(3)
  })

  it('stops at the last page', () => {
    const board = boardFromPages([page([request({ id: 'a' })], 1, 1, 1)])
    expect(board.hasMore).toBe(false)
  })

  it('is empty before anything loaded', () => {
    expect(boardFromPages([])).toEqual({ items: [], total: 0, hasMore: false, nextPage: 1 })
  })
})

describe('own status of a request opened by id', () => {
  it('uses the board status when the server sent one', () => {
    expect(myOrderStatus(request({ myStatus: 'NEGOTIATING' }), NOW)).toBe('NEGOTIATING')
  })

  it('takes the jeweler’s own delivery status', () => {
    expect(myOrderStatus(request({ targets: [{ jewelerProfileId: 'p1', status: 'QUOTE_SUBMITTED' }] }), NOW)).toBe(
      'QUOTE_SUBMITTED',
    )
  })

  it('closes a new order whose request stopped taking quotes or whose listing ended', () => {
    expect(myOrderStatus(request({ status: 'CANCELLED' }), NOW)).toBe('CLOSED')
    expect(
      myOrderStatus(request({ design: { id: 'd1', title: null, thumbnailUploadId: null, status: 'PUBLISHED', expiresAt: '2026-10-01T00:00:00.000Z' } }), NOW),
    ).toBe('CLOSED')
    expect(
      myOrderStatus(request({ design: { id: 'd1', title: null, thumbnailUploadId: null, status: 'ARCHIVED', expiresAt: null } }), NOW),
    ).toBe('CLOSED')
    expect(myOrderStatus(request(), NOW)).toBe('NEW')
  })
})

describe('order details actions (PRD 8)', () => {
  it('a new order can be quoted or declined', () => {
    const actions = orderActions(request(), NOW)
    expect(actions).toMatchObject({ canSubmitQuote: true, canEditQuote: false, canWithdrawQuote: false, canDecline: true })
    expect(actions.quote).toBeNull()
  })

  it('a pending quote can be edited or withdrawn, and declining stays available', () => {
    const actions = orderActions(
      request({ targets: [{ jewelerProfileId: 'p1', status: 'QUOTE_SUBMITTED' }], quotes: [quote()] }),
      NOW,
    )
    expect(actions).toMatchObject({ canSubmitQuote: false, canEditQuote: true, canWithdrawQuote: true, canDecline: true })
    expect(actions.quote?.id).toBe('q1')
  })

  it('a withdrawn quote is not offered for editing; a new one can be made', () => {
    const actions = orderActions(request({ quotes: [quote({ status: 'WITHDRAWN' })] }), NOW)
    expect(actions.quote).toBeNull()
    expect(actions.canEditQuote).toBe(false)
    expect(actions.canSubmitQuote).toBe(true)
  })

  it('a completed order can be neither declined nor re-quoted', () => {
    const actions = orderActions(
      request({ targets: [{ jewelerProfileId: 'p1', status: 'COMPLETED' }], quotes: [quote({ status: 'ACCEPTED' })] }),
      NOW,
    )
    expect(actions).toMatchObject({ canSubmitQuote: false, canEditQuote: false, canWithdrawQuote: false, canDecline: false })
    expect(actions.quote?.status).toBe('ACCEPTED')
  })

  it('a closed order offers nothing', () => {
    const actions = orderActions(request({ status: 'CANCELLED' }), NOW)
    expect(actions).toMatchObject({ canSubmitQuote: false, canDecline: false })
  })
})

describe('the jeweler’s standing quote', () => {
  it('is the newest open or accepted one', () => {
    const found = currentQuote([
      quote({ id: 'old', createdAt: '2026-10-01T00:00:00.000Z' }),
      quote({ id: 'gone', status: 'WITHDRAWN', createdAt: '2026-10-12T00:00:00.000Z' }),
      quote({ id: 'new', createdAt: '2026-10-05T00:00:00.000Z' }),
    ])
    expect(found?.id).toBe('new')
    expect(currentQuote([quote({ status: 'DECLINED' })])).toBeNull()
    expect(currentQuote(undefined)).toBeNull()
  })
})

describe('the full design specification on an order', () => {
  it('names the item type and lists the parameters and the notes for the jeweler', () => {
    const rows = Object.fromEntries(
      designSpecRows({
        itemType: { id: 't1', code: 'RING', labelHe: 'טבעת', labelEn: 'Ring' },
        parameters: { metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' } },
        jewelerNotes: 'please keep the band thin',
      }).map((row) => [row.label, row.value]),
    )
    expect(rows['סוג']).toBe('טבעת')
    expect(rows['מתכת']).toBe('זהב צהוב 14K')
    expect(rows['הערות לצורף']).toBe('please keep the band thin')
  })

  it('is empty for a design without details', () => {
    expect(designSpecRows(null)).toEqual([])
  })
})
