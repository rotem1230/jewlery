import type { DesignQuote } from '../src/api/designs'
import {
  canAcceptQuote,
  effectiveQuoteStatus,
  previousQuoteRows,
  quoteAcceptErrorMessage,
  quoteStatusLabel,
} from '../src/lib/quoteStatus'

const NOW = new Date('2026-10-13T12:00:00.000Z')

function quote(overrides: Partial<DesignQuote> = {}): DesignQuote {
  return {
    id: 'q1',
    conversationId: 'c1',
    designRequestId: null,
    status: 'PENDING',
    materialsCost: '3000',
    laborCost: '1500.5',
    totalPrice: '4500.5',
    currency: 'ILS',
    etaBusinessDays: 21,
    notes: null,
    validUntil: null,
    acceptedAt: null,
    declinedAt: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    author: { id: 'j1', firstName: 'אריאל', lastName: 'כהן', businessName: 'צורפות כהן' },
    ...overrides,
  }
}

describe('previous quotes of a design (PRD 5.3)', () => {
  it("shows each quote's jeweler business, total with currency, delivery days, date and status", () => {
    const [row] = previousQuoteRows([quote()], 'he', NOW)
    expect(row).toEqual({
      id: 'q1',
      conversationId: 'c1',
      jeweler: 'צורפות כהן',
      total: '₪ 4,500.50',
      etaDays: 21,
      date: '05.10.2026',
      status: 'PENDING',
      statusLabel: 'ממתינה לתשובה',
    })
  })

  it('names the jeweler by name when there is no business name, and keeps the quote currency', () => {
    const [row] = previousQuoteRows(
      [quote({ currency: 'USD', totalPrice: 1200, author: { id: 'j1', firstName: 'Dana', lastName: 'Levi', businessName: null } })],
      'he',
      NOW,
    )
    expect(row.jeweler).toBe('Dana Levi')
    expect(row.total).toBe('$ 1,200')
    const [anonymous] = previousQuoteRows([quote({ author: null })], 'he', NOW)
    expect(anonymous.jeweler).toBe('צורף')
  })

  it('a pending quote past its validity is shown as expired', () => {
    const [row] = previousQuoteRows([quote({ validUntil: '2026-10-10T00:00:00.000Z' })], 'he', NOW)
    expect(row.status).toBe('EXPIRED')
    expect(row.statusLabel).toBe('פג תוקף')
  })
})

describe('quote status labels', () => {
  it('has a Hebrew label for every status', () => {
    expect(quoteStatusLabel('PENDING', 'he')).toBe('ממתינה לתשובה')
    expect(quoteStatusLabel('ACCEPTED', 'he')).toBe('אושרה')
    expect(quoteStatusLabel('DECLINED', 'he')).toBe('נדחתה')
    expect(quoteStatusLabel('EXPIRED', 'he')).toBe('פג תוקף')
    expect(quoteStatusLabel('WITHDRAWN', 'he')).toBe('נמשכה ע״י הצורף')
    expect(quoteStatusLabel('ACCEPTED', 'en')).toBe('Accepted')
    expect(quoteStatusLabel('SOMETHING', 'he')).toBe('SOMETHING')
  })
})

describe('accepting a quote (PRD 5.6)', () => {
  it('only a pending, still valid quote of someone else can be accepted', () => {
    expect(canAcceptQuote({ status: 'PENDING', authorUserId: 'j1', validUntil: null }, 'designer', NOW)).toBe(true)
    expect(canAcceptQuote({ status: 'PENDING', authorUserId: 'j1', validUntil: null }, 'j1', NOW)).toBe(false)
    for (const status of ['EXPIRED', 'WITHDRAWN', 'DECLINED', 'ACCEPTED']) {
      expect(canAcceptQuote({ status, authorUserId: 'j1', validUntil: null }, 'designer', NOW)).toBe(false)
    }
    const lapsed = { status: 'PENDING', authorUserId: 'j1', validUntil: '2026-10-12T00:00:00.000Z' }
    expect(canAcceptQuote(lapsed, 'designer', NOW)).toBe(false)
    expect(effectiveQuoteStatus(lapsed, NOW)).toBe('EXPIRED')
  })

  it('explains in Hebrew why the server refused an accept', () => {
    expect(quoteAcceptErrorMessage('DESIGN_CHANGED_SINCE_QUOTE', 'he')).toEqual({
      title: 'העיצוב השתנה',
      body: 'העיצוב השתנה אחרי שההצעה תומחרה. בקשו מהצורף הצעה מעודכנת.',
    })
    expect(quoteAcceptErrorMessage('QUOTE_EXPIRED', 'he')?.title).toBe('תוקף ההצעה פג')
    expect(quoteAcceptErrorMessage('DESIGN_EXPIRED', 'he')?.title).toBe('תוקף פרסום העיצוב פג')
    expect(quoteAcceptErrorMessage('QUOTE_NOT_PENDING', 'he')?.title).toBe('ההצעה אינה זמינה עוד')
    expect(quoteAcceptErrorMessage('DESIGN_NOT_OPEN', 'he')?.title).toBe('כבר אושרה הצעה לעיצוב זה')
    expect(quoteAcceptErrorMessage('SOMETHING_ELSE', 'he')).toBeNull()
    expect(quoteAcceptErrorMessage(undefined, 'he')).toBeNull()
  })
})
