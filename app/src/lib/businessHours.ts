import type { TranslationKey } from '@/src/i18n'
import type { BusinessHour, JewelerDraftPayload } from '@/src/types/api'

/** Weekday names, Sunday (0) first — the server's day numbering. */
export const DAY_LABEL_KEYS: readonly TranslationKey[] = [
  'jwDay0',
  'jwDay1',
  'jwDay2',
  'jwDay3',
  'jwDay4',
  'jwDay5',
  'jwDay6',
]

/** One weekday row of the profile form: open or closed, and the times as typed. */
export type DayHours = { day: number; open: boolean; from: string; to: string }

export type HoursError = 'time' | 'order'

function asHour(value: unknown): BusinessHour | null {
  if (!value || typeof value !== 'object') return null
  const { day, open, close } = value as Record<string, unknown>
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return null
  if (typeof open !== 'string' || typeof close !== 'string') return null
  return { day, open, close }
}

/** The saved hours as the form's seven weekday rows (one range per day; the form saves one). */
export function hoursFormFromProfile(value: unknown): DayHours[] {
  const saved = Array.isArray(value) ? value.map(asHour).filter((hour): hour is BusinessHour => hour !== null) : []
  return DAY_LABEL_KEYS.map((_, day) => {
    const hour = saved.find((item) => item.day === day)
    return hour ? { day, open: true, from: hour.open, to: hour.close } : { day, open: false, from: '', to: '' }
  })
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** "9:05" → "09:05"; null unless it is a time on a 24-hour clock. */
export function normalizeTime(raw: string): string | null {
  const match = TIME.exec(raw.trim())
  if (!match) return null
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

/** The open days as saved hours, and the days to fix: a malformed time, or closing not after opening. */
export function validateHours(rows: DayHours[]): {
  hours: BusinessHour[]
  errors: Partial<Record<number, HoursError>>
} {
  const hours: BusinessHour[] = []
  const errors: Partial<Record<number, HoursError>> = {}
  for (const row of rows) {
    if (!row.open) continue
    const open = normalizeTime(row.from)
    const close = normalizeTime(row.to)
    if (!open || !close) {
      errors[row.day] = 'time'
    } else if (close <= open) {
      // Zero-padded HH:MM strings compare in time order.
      errors[row.day] = 'order'
    } else {
      hours.push({ day: row.day, open, close })
    }
  }
  return { hours, errors }
}

/** The opening hours to show on a profile, Sunday first; several ranges of a day are joined. */
export function hoursRows(hours: BusinessHour[] | null | undefined): Array<{ day: number; text: string }> {
  const valid = (Array.isArray(hours) ? hours : []).map(asHour).filter((hour): hour is BusinessHour => hour !== null)
  const days = [...new Set(valid.map((hour) => hour.day))].sort((a, b) => a - b)
  return days.map((day) => ({
    day,
    text: valid
      .filter((hour) => hour.day === day)
      .map((hour) => `${hour.open}–${hour.close}`)
      .join(', '),
  }))
}

/**
 * The draft as saved from the form. The server replaces the whole draft and publishes it as is,
 * so the fields the form does not edit (specialties) are passed through, or publishing would erase them.
 */
export function draftPayload(input: {
  businessName: string
  bio: string
  phone: string
  email: string
  businessHours: BusinessHour[]
  serviceAreaText: string
  specialties?: string[] | null
}): JewelerDraftPayload {
  const payload: JewelerDraftPayload = {
    businessName: input.businessName.trim(),
    bio: input.bio.trim() || undefined,
    phone: input.phone,
    email: input.email.trim() || undefined,
    businessHours: input.businessHours,
    serviceAreaText: input.serviceAreaText.trim() || undefined,
  }
  if (Array.isArray(input.specialties)) payload.specialties = input.specialties
  return payload
}
