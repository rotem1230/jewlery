import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthUser } from './store'

/** Where builds before the keychain move kept the session (plain app storage, included in backups). */
const LEGACY_SESSION_KEY = '@malinvosky/auth_session'
const KEYCHAIN_SERVICE = 'com.malinvosky.auth.session'
const KEYCHAIN_ACCOUNT = 'session'

export type PersistedAuthSession = {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

type KeychainModule = {
  ACCESSIBLE?: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY?: string }
  setGenericPassword: (
    username: string,
    password: string,
    options?: { service?: string; accessible?: string },
  ) => Promise<unknown>
  getGenericPassword: (options?: { service?: string }) => Promise<false | { password: string }>
  resetGenericPassword: (options?: { service?: string }) => Promise<unknown>
}

/**
 * The OS keychain (iOS Keychain / Android Keystore-backed storage), or null when the native module
 * is not linked in this build — then the session falls back to app storage.
 */
function keychain(): KeychainModule | null {
  try {
    const mod = require('react-native-keychain') as KeychainModule
    return typeof mod?.getGenericPassword === 'function' ? mod : null
  } catch {
    return null
  }
}

function parse(raw: string | null | undefined): PersistedAuthSession | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PersistedAuthSession
    return parsed?.user && parsed.accessToken ? parsed : null
  } catch {
    return null
  }
}

async function readLegacy(): Promise<PersistedAuthSession | null> {
  try {
    return parse(await AsyncStorage.getItem(LEGACY_SESSION_KEY))
  } catch {
    return null
  }
}

async function removeLegacy(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    // ignore
  }
}

export async function loadAuthSession(): Promise<PersistedAuthSession | null> {
  const secure = keychain()
  if (!secure) return readLegacy()
  try {
    const stored = await secure.getGenericPassword({ service: KEYCHAIN_SERVICE })
    const session = stored ? parse(stored.password) : null
    if (session) return session
  } catch {
    return readLegacy()
  }
  // A session saved by an older build moves into the keychain once.
  const legacy = await readLegacy()
  if (legacy) {
    await saveAuthSession(legacy)
  }
  return legacy
}

export async function saveAuthSession(session: PersistedAuthSession): Promise<void> {
  const secure = keychain()
  if (secure) {
    try {
      await secure.setGenericPassword(KEYCHAIN_ACCOUNT, JSON.stringify(session), {
        service: KEYCHAIN_SERVICE,
        // Never synced to other devices or restored from a backup onto another phone.
        accessible: secure.ACCESSIBLE?.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      })
      await removeLegacy()
      return
    } catch {
      // fall through to app storage so the user is not signed out by a keychain hiccup
    }
  }
  try {
    await AsyncStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Ignore persistence failures — in-memory session still works for this run.
  }
}

export async function clearAuthSession(): Promise<void> {
  const secure = keychain()
  if (secure) {
    try {
      await secure.resetGenericPassword({ service: KEYCHAIN_SERVICE })
    } catch {
      // ignore
    }
  }
  await removeLegacy()
}
