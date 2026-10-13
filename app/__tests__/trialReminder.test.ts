import AsyncStorage from '@react-native-async-storage/async-storage'
import { lastTrialReminderAt, rememberTrialReminder, shouldShowTrialEnding } from '../src/lib/trialReminder'

const NOW = new Date(2026, 9, 13, 10, 0)
const inDays = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

describe('"your trial is ending" reminder', () => {
  it('shows when the trial ends within three days', () => {
    expect(shouldShowTrialEnding({ status: 'TRIALING', trialEndsAt: inDays(2) }, NOW, null)).toBe(true)
    expect(shouldShowTrialEnding({ status: 'TRIALING', trialEndsAt: inDays(3) }, NOW, null)).toBe(true)
  })

  it('not earlier, not after the trial ended, and not for a paid or missing subscription', () => {
    expect(shouldShowTrialEnding({ status: 'TRIALING', trialEndsAt: inDays(5) }, NOW, null)).toBe(false)
    expect(shouldShowTrialEnding({ status: 'TRIALING', trialEndsAt: inDays(-1) }, NOW, null)).toBe(false)
    expect(shouldShowTrialEnding({ status: 'ACTIVE', trialEndsAt: inDays(2) }, NOW, null)).toBe(false)
    expect(shouldShowTrialEnding({ status: 'TRIALING', trialEndsAt: null }, NOW, null)).toBe(false)
    expect(shouldShowTrialEnding(null, NOW, null)).toBe(false)
  })

  it('at most once a day', () => {
    const trial = { status: 'TRIALING', trialEndsAt: inDays(2) }
    expect(shouldShowTrialEnding(trial, NOW, new Date(2026, 9, 13, 8, 0).toISOString())).toBe(false)
    expect(shouldShowTrialEnding(trial, NOW, new Date(2026, 9, 12, 23, 0).toISOString())).toBe(true)
  })

  it('remembers when it was last shown, per user', async () => {
    await AsyncStorage.clear()
    expect(await lastTrialReminderAt('u1')).toBeNull()
    await rememberTrialReminder('u1', NOW)
    expect(await lastTrialReminderAt('u1')).toBe(NOW.toISOString())
    expect(await lastTrialReminderAt('u2')).toBeNull()
  })
})
