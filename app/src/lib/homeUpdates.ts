/**
 * The designer home "recent updates" (PRD 5.2): Hebrew titles by event (the server stores English
 * titles), relative times, where each update leads, and an in-memory cache of the last summary so
 * returning to the home tab shows it at once while it refreshes.
 */
import { isolate } from '@/src/lib/rtl'
import type { AppNotification, HomeSummary } from '@/src/types/api'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "לפני 5 דקות", "אתמול", "לפני שבוע"; past a month, the date. Device-local time. */
export function formatTimeAgo(iso: string | null | undefined, locale: string, now: Date = new Date()): string {
  if (!iso) return ''
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const he = locale !== 'en'
  const minutes = Math.max(0, Math.floor((now.getTime() - then.getTime()) / MINUTE_MS))
  if (minutes < 1) return he ? 'עכשיו' : 'Just now'
  if (minutes < 60) {
    if (he) return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דקות`
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    if (he) return hours === 1 ? 'לפני שעה' : hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שעות`
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  // Rounded: a day across a daylight-saving change is 23 or 25 hours long.
  const days = Math.max(1, Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS))
  if (days === 1) return he ? 'אתמול' : 'Yesterday'
  if (days < 7) {
    if (he) return days === 2 ? 'לפני יומיים' : `לפני ${days} ימים`
    return `${days} days ago`
  }
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    if (he) return weeks === 1 ? 'לפני שבוע' : weeks === 2 ? 'לפני שבועיים' : `לפני ${weeks} שבועות`
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  const date = `${pad(then.getDate())}.${pad(then.getMonth() + 1)}.${then.getFullYear()}`
  return he ? date : date.replace(/\./g, '/')
}

type NotificationLike = Pick<AppNotification, 'eventKey' | 'title'> & { payload?: unknown }

function payloadText(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const HEBREW_LETTER = /^[֐-׿]/

const EVENT_TITLES: Record<string, { he: string; en: string }> = {
  'quote.created': { he: 'התקבלה הצעת מחיר חדשה', en: 'New quote received' },
  'quote.updated': { he: 'הצעת מחיר עודכנה', en: 'A quote was updated' },
  'quote.accepted': { he: 'הצעת המחיר אושרה', en: 'Quote accepted' },
  'quote.declined': { he: 'הצעת המחיר נדחתה', en: 'Quote declined' },
  'quote.withdrawn': { he: 'הצעת מחיר נמשכה', en: 'Quote withdrawn' },
  'ai.completed': { he: 'תמונת ההשראה מוכנה', en: 'AI inspiration ready' },
  'render.completed': { he: 'קובץ הייצוא מוכן', en: 'Export ready' },
  'visualization.completed': { he: 'ההדמיה מוכנה', en: 'Try-on ready' },
  'jewelry_payment.received': { he: 'התקבל תשלום על הזמנה', en: 'Payment received for an order' },
}

/** The update's title in the app language; an event the app does not know keeps its stored title. */
export function notificationTitle(notification: NotificationLike, locale: string): string {
  const he = locale !== 'en'
  if (notification.eventKey === 'message.new') {
    const sender = payloadText(notification.payload, 'senderName')
    if (sender) {
      if (!he) return `New message from ${sender}`
      return HEBREW_LETTER.test(sender) ? `הודעה חדשה מ${sender}` : `הודעה חדשה מ-${isolate(sender)}`
    }
    const design = payloadText(notification.payload, 'designTitle')
    if (design) return he ? `הודעה חדשה על ${isolate(design)}` : `New message about ${design}`
    return he ? 'הודעה חדשה' : 'New message'
  }
  const known = EVENT_TITLES[notification.eventKey]
  if (known) return he ? known.he : known.en
  return notification.title
}

export type NotificationTarget =
  | { kind: 'quote'; quoteId: string; chatId: string }
  | { kind: 'chat'; chatId: string }
  | { kind: 'chats' }

/** A quote opens the quote (in its chat), a message its chat; otherwise the chat list. */
export function notificationTarget(notification: Pick<AppNotification, 'eventKey'> & { payload?: unknown }): NotificationTarget {
  const chatId = payloadText(notification.payload, 'conversationId')
  const quoteId = payloadText(notification.payload, 'quoteId')
  if (quoteId && chatId) return { kind: 'quote', quoteId, chatId }
  if (chatId) return { kind: 'chat', chatId }
  return { kind: 'chats' }
}

export type HomeUpdateRow = { id: string; title: string; subtitle: string; target: NotificationTarget }

export const HOME_UPDATES_LIMIT = 3

/** The real updates only (never sample rows): none means an empty list. */
export function homeUpdateRows(
  notifications: AppNotification[] | null | undefined,
  locale: string,
  now: Date = new Date(),
): HomeUpdateRow[] {
  return (notifications ?? []).slice(0, HOME_UPDATES_LIMIT).map((notification) => ({
    id: notification.id,
    title: notificationTitle(notification, locale),
    subtitle: formatTimeAgo(notification.createdAt, locale, now),
    target: notificationTarget(notification),
  }))
}

const summaries = new Map<string, HomeSummary>()

/** One cache entry per user and role; no user, no cache. */
export function homeCacheKey(userId: string | null | undefined, role: string | null | undefined): string | null {
  return userId && role ? `${userId}:${role}` : null
}

export function cachedHomeSummary(key: string | null): HomeSummary | null {
  return key ? summaries.get(key) ?? null : null
}

export function rememberHomeSummary(key: string | null, summary: HomeSummary): void {
  if (key) summaries.set(key, summary)
}

export function clearHomeSummaryCache(): void {
  summaries.clear()
}
