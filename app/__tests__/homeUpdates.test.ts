import {
  cachedHomeSummary,
  clearHomeSummaryCache,
  formatTimeAgo,
  homeCacheKey,
  homeUpdateRows,
  notificationTarget,
  notificationTitle,
  rememberHomeSummary,
} from '../src/lib/homeUpdates'
import type { HomeSummary } from '../src/types/api'

const NOW = new Date(2026, 9, 13, 15, 0, 0)
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('relative times in the recent updates (PRD 5.2)', () => {
  it('says how long ago, in Hebrew', () => {
    expect(formatTimeAgo(ago(20 * 1000), 'he', NOW)).toBe('עכשיו')
    expect(formatTimeAgo(ago(MINUTE), 'he', NOW)).toBe('לפני דקה')
    expect(formatTimeAgo(ago(5 * MINUTE), 'he', NOW)).toBe('לפני 5 דקות')
    expect(formatTimeAgo(ago(HOUR), 'he', NOW)).toBe('לפני שעה')
    expect(formatTimeAgo(ago(2 * HOUR), 'he', NOW)).toBe('לפני שעתיים')
    expect(formatTimeAgo(ago(5 * HOUR), 'he', NOW)).toBe('לפני 5 שעות')
  })

  it('names yesterday and earlier days by the calendar', () => {
    expect(formatTimeAgo(new Date(2026, 9, 12, 9, 0).toISOString(), 'he', NOW)).toBe('אתמול')
    expect(formatTimeAgo(new Date(2026, 9, 11, 9, 0).toISOString(), 'he', NOW)).toBe('לפני יומיים')
    expect(formatTimeAgo(new Date(2026, 9, 9, 9, 0).toISOString(), 'he', NOW)).toBe('לפני 4 ימים')
    expect(formatTimeAgo(new Date(2026, 9, 4, 9, 0).toISOString(), 'he', NOW)).toBe('לפני שבוע')
    expect(formatTimeAgo(new Date(2026, 8, 25, 9, 0).toISOString(), 'he', NOW)).toBe('לפני שבועיים')
    expect(formatTimeAgo(new Date(2026, 7, 1, 9, 0).toISOString(), 'he', NOW)).toBe('01.08.2026')
  })

  it('has an English form and never prints garbage for a missing or bad date', () => {
    expect(formatTimeAgo(ago(5 * MINUTE), 'en', NOW)).toBe('5 minutes ago')
    expect(formatTimeAgo(new Date(2026, 9, 12, 9, 0).toISOString(), 'en', NOW)).toBe('Yesterday')
    expect(formatTimeAgo(null, 'he', NOW)).toBe('')
    expect(formatTimeAgo('not a date', 'he', NOW)).toBe('')
  })
})

describe('update titles by event (titles are stored in English)', () => {
  it('a new chat message names the sender', () => {
    const n = {
      eventKey: 'message.new',
      title: 'New message from Ariel',
      payload: { conversationId: 'c1', designId: 'd1', senderName: 'אריאל הצורף' },
    }
    expect(notificationTitle(n, 'he')).toBe('הודעה חדשה מאריאל הצורף')
    expect(notificationTitle({ ...n, payload: { conversationId: 'c1', senderName: 'Ariel' } }, 'he')).toBe(
      'הודעה חדשה מ-Ariel',
    )
    expect(notificationTitle({ ...n, payload: { conversationId: 'c1', designTitle: 'טבעת סוליטר' } }, 'he')).toBe(
      'הודעה חדשה על טבעת סוליטר',
    )
    expect(notificationTitle({ ...n, payload: null }, 'he')).toBe('הודעה חדשה')
  })

  it('quote events get their Hebrew title', () => {
    const title = (eventKey: string) => notificationTitle({ eventKey, title: 'English', payload: null }, 'he')
    expect(title('quote.created')).toBe('התקבלה הצעת מחיר חדשה')
    expect(title('quote.declined')).toBe('הצעת המחיר נדחתה')
    expect(title('quote.withdrawn')).toBe('הצעת מחיר נמשכה')
    expect(title('quote.accepted')).toBe('הצעת המחיר אושרה')
  })

  it('an unknown event falls back to the stored title', () => {
    expect(notificationTitle({ eventKey: 'something.new', title: 'Stored title', payload: null }, 'he')).toBe('Stored title')
  })
})

describe('where an update leads', () => {
  it('a quote opens the quote, a message opens its chat, anything else the chat list', () => {
    expect(notificationTarget({ eventKey: 'quote.created', payload: { quoteId: 'q1', conversationId: 'c1' } })).toEqual({
      kind: 'quote',
      quoteId: 'q1',
      chatId: 'c1',
    })
    expect(notificationTarget({ eventKey: 'message.new', payload: { conversationId: 'c1' } })).toEqual({
      kind: 'chat',
      chatId: 'c1',
    })
    expect(notificationTarget({ eventKey: 'quote.accepted', payload: { quoteId: 'q1' } })).toEqual({ kind: 'chats' })
  })
})

describe('the recent updates list', () => {
  it('shows at most three real updates with Hebrew titles and relative times; none means an empty list', () => {
    const notifications = [1, 2, 3, 4].map((i) => ({
      id: `n${i}`,
      eventKey: 'quote.created',
      title: 'New quote received',
      body: 'You received a new quote',
      payload: { quoteId: `q${i}`, conversationId: `c${i}` },
      createdAt: ago(i * 5 * MINUTE),
      readAt: null,
    }))
    const rows = homeUpdateRows(notifications, 'he', NOW)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      id: 'n1',
      title: 'התקבלה הצעת מחיר חדשה',
      subtitle: 'לפני 5 דקות',
      target: { kind: 'quote', quoteId: 'q1', chatId: 'c1' },
    })
    expect(homeUpdateRows([], 'he', NOW)).toEqual([])
    expect(homeUpdateRows(undefined, 'he', NOW)).toEqual([])
  })
})

describe('home summary cache', () => {
  const summary: HomeSummary = { role: 'DESIGNER', recentDesigns: [], recentNotifications: [] }

  beforeEach(() => clearHomeSummaryCache())

  it('returns the last summary of the same user and role', () => {
    const key = homeCacheKey('u1', 'DESIGNER')
    expect(cachedHomeSummary(key)).toBeNull()
    rememberHomeSummary(key, summary)
    expect(cachedHomeSummary(key)).toBe(summary)
  })

  it('never shows one user or role the summary of another', () => {
    rememberHomeSummary(homeCacheKey('u1', 'DESIGNER'), summary)
    expect(cachedHomeSummary(homeCacheKey('u2', 'DESIGNER'))).toBeNull()
    expect(cachedHomeSummary(homeCacheKey('u1', 'JEWELER'))).toBeNull()
    expect(homeCacheKey(null, 'DESIGNER')).toBeNull()
    rememberHomeSummary(null, summary)
    expect(cachedHomeSummary(null)).toBeNull()
  })
})
