import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthUser } from './store'

const AUTH_SESSION_KEY = '@malinvosky/auth_session'

export type PersistedAuthSession = {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export async function loadAuthSession(): Promise<PersistedAuthSession | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedAuthSession
    if (!parsed?.user || !parsed.accessToken) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveAuthSession(session: PersistedAuthSession): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Ignore persistence failures — in-memory session still works for this run.
  }
}

export async function clearAuthSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_SESSION_KEY)
  } catch {
    // ignore
  }
}
