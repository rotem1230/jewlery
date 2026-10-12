/**
 * Chat time formatting (Hebrew-first, device-local timezone).
 * Server timestamps are UTC; every helper below renders in local time so
 * rows, badges and bubbles always agree with each other.
 */

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const HE_WEEKDAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']

/** List-row stamp: today → `14:23`, yesterday → `אתמול`, this week → weekday, else `dd.MM.yyyy`. */
export function formatChatTime(iso: string | null, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (Number.isNaN(d.getTime())) return ''
  if (sameDay(d, now)) return formatClock(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return locale === 'he' ? 'אתמול' : 'Yesterday'
  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000)
  if (locale === 'he') {
    if (diffDays > 0 && diffDays < 7) return HE_WEEKDAYS[d.getDay()] ?? formatClock(iso)
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  }
  if (diffDays > 0 && diffDays < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'long' })
  }
  return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Day separator label for thread groups: `היום, 14:30` style. */
export function formatDayLabel(iso: string, locale: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (locale === 'he') {
    if (sameDay(d, now)) return `היום, ${formatClock(iso)}`
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (sameDay(d, yesterday)) return `אתמול, ${formatClock(iso)}`
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  }
  if (sameDay(d, now)) return `Today, ${formatClock(iso)}`
  return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Groups oldest-first messages into day buckets for separators. */
export function groupMessagesByDay<T extends { id: string; createdAt: string }>(
  messages: T[],
): Array<{ dayKey: string; dayLabel: string; items: T[] }> {
  const groups = new Map<string, T[]>()
  for (const msg of messages) {
    const d = new Date(msg.createdAt)
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(msg)
    else groups.set(key, [msg])
  }
  return [...groups.entries()].map(([dayKey, items]) => ({ dayKey, dayLabel: '', items }))
}
