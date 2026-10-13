/**
 * Quote status as the designer sees it: the previous quotes of a design (PRD 5.3), whether a quote
 * can still be accepted, and why the server refused an accept (PRD 5.6).
 */
import type { DesignQuote } from '@/src/api/designs'
import { currencySymbol, displayName, formatMoney } from '@/src/lib/format'

type Locale = 'he' | 'en' | string

const STATUS_LABELS: Record<string, { he: string; en: string }> = {
  PENDING: { he: 'ממתינה לתשובה', en: 'Awaiting your answer' },
  ACCEPTED: { he: 'אושרה', en: 'Accepted' },
  DECLINED: { he: 'נדחתה', en: 'Declined' },
  EXPIRED: { he: 'פג תוקף', en: 'Expired' },
  WITHDRAWN: { he: 'נמשכה ע״י הצורף', en: 'Withdrawn by the jeweler' },
}

export function quoteStatusLabel(status: string, locale: Locale): string {
  const label = STATUS_LABELS[status]
  if (!label) return status
  return locale === 'en' ? label.en : label.he
}

type StatusInput = { status: string; validUntil?: string | null }

/** A pending quote past its validity can no longer be accepted, even before the server sweeps it. */
export function effectiveQuoteStatus(quote: StatusInput, now: Date = new Date()): string {
  if (quote.status !== 'PENDING' || !quote.validUntil) return quote.status
  const until = new Date(quote.validUntil).getTime()
  return Number.isFinite(until) && until < now.getTime() ? 'EXPIRED' : quote.status
}

/** Only the design owner accepts, and only a quote that is still pending and valid. */
export function canAcceptQuote(
  quote: StatusInput & { authorUserId: string },
  userId: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return effectiveQuoteStatus(quote, now) === 'PENDING' && quote.authorUserId !== userId
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export type PreviousQuoteRow = {
  id: string
  conversationId: string
  jeweler: string
  total: string
  etaDays: number
  date: string
  status: string
  statusLabel: string
}

/** One row per quote: the jeweler's business, the total in the quote's currency, ETA, date, status. */
export function previousQuoteRows(quotes: DesignQuote[], locale: Locale, now: Date = new Date()): PreviousQuoteRow[] {
  return quotes.map((quote) => {
    const status = effectiveQuoteStatus(quote, now)
    const author = quote.author
    const jeweler =
      author?.businessName?.trim() ||
      displayName(author?.firstName, author?.lastName, locale === 'en' ? 'Jeweler' : 'צורף')
    return {
      id: quote.id,
      conversationId: quote.conversationId,
      jeweler,
      total: formatMoney(quote.totalPrice, currencySymbol(quote.currency)),
      etaDays: quote.etaBusinessDays,
      date: formatDate(quote.createdAt),
      status,
      statusLabel: quoteStatusLabel(status, locale),
    }
  })
}

export type RefusalMessage = { title: string; body: string }

const ACCEPT_REFUSALS: Record<string, { he: RefusalMessage; en: RefusalMessage }> = {
  DESIGN_CHANGED_SINCE_QUOTE: {
    he: { title: 'העיצוב השתנה', body: 'העיצוב השתנה אחרי שההצעה תומחרה. בקשו מהצורף הצעה מעודכנת.' },
    en: {
      title: 'The design changed',
      body: 'The design changed after this quote was priced. Ask the jeweler for an updated quote.',
    },
  },
  QUOTE_EXPIRED: {
    he: { title: 'תוקף ההצעה פג', body: 'לא ניתן לאשר הצעה שתוקפה פג. בקשו מהצורף הצעה חדשה.' },
    en: { title: 'This quote expired', body: 'An expired quote cannot be accepted. Ask the jeweler for a new one.' },
  },
  DESIGN_EXPIRED: {
    he: { title: 'תוקף פרסום העיצוב פג', body: 'פרסום העיצוב הסתיים. פרסמו אותו מחדש כדי לקבל ולאשר הצעות.' },
    en: { title: 'The listing expired', body: 'This design is no longer listed. Publish it again to receive and accept quotes.' },
  },
  QUOTE_NOT_PENDING: {
    he: { title: 'ההצעה אינה זמינה עוד', body: 'ההצעה כבר נדחתה, נמשכה או אושרה.' },
    en: { title: 'This quote is no longer open', body: 'It was already declined, withdrawn or accepted.' },
  },
  DESIGN_NOT_OPEN: {
    he: { title: 'כבר אושרה הצעה לעיצוב זה', body: 'לעיצוב יכולה להיות הצעה מאושרת אחת בלבד.' },
    en: { title: 'A quote was already accepted', body: 'A design can have only one accepted quote.' },
  },
}

/** The Hebrew explanation of an accept refused by the server; null for codes without one. */
export function quoteAcceptErrorMessage(code: string | undefined, locale: Locale): RefusalMessage | null {
  const message = code ? ACCEPT_REFUSALS[code] : undefined
  if (!message) return null
  return locale === 'en' ? message.en : message.he
}
