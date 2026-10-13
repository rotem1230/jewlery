/**
 * "Your trial is ending" (designer home): shown when the live subscription is a trial that ends
 * within three days, at most once a calendar day per user.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export const TRIAL_REMINDER_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function shouldShowTrialEnding(
  subscription: { status: string; trialEndsAt?: string | null } | null | undefined,
  now: Date,
  lastShownAt: string | null,
): boolean {
  if (!subscription || subscription.status !== 'TRIALING' || !subscription.trialEndsAt) return false
  const endsAt = new Date(subscription.trialEndsAt).getTime()
  if (!Number.isFinite(endsAt)) return false
  const left = endsAt - now.getTime()
  if (left <= 0 || left > TRIAL_REMINDER_DAYS * DAY_MS) return false
  if (lastShownAt) {
    const last = new Date(lastShownAt)
    if (!Number.isNaN(last.getTime()) && sameDay(last, now)) return false
  }
  return true
}

const keyFor = (userId: string) => `@malinvosky/trial-ending-shown/${userId}`

export async function lastTrialReminderAt(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(keyFor(userId))
  } catch {
    return null
  }
}

export async function rememberTrialReminder(userId: string, now: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), now.toISOString())
  } catch {
    // Best effort: at worst the reminder shows again on the next visit.
  }
}
