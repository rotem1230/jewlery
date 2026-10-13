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

/** What is written: the session plus when it was saved, so the newer of two copies can be told apart. */
type StoredSession = PersistedAuthSession & { savedAt?: number }

let lastStamp = 0
/** Strictly increasing within a run (two saves in one millisecond still order correctly). */
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

function parse(raw: string | null | undefined): StoredSession | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredSession
    return parsed?.user && parsed.accessToken ? parsed : null
  } catch {
    return null
  }
}

function withoutStamp({ user, accessToken, refreshToken }: StoredSession): PersistedAuthSession {
  return { user, accessToken, refreshToken }
}

async function readLegacy(): Promise<StoredSession | null> {
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
  const legacy = await readLegacy()
  if (!secure) return legacy && withoutStamp(legacy)
  let secured: StoredSession | null
  try {
    const stored = await secure.getGenericPassword({ service: KEYCHAIN_SERVICE })
    secured = stored ? parse(stored.password) : null
  } catch {
    return legacy && withoutStamp(legacy)
  }
  // A copy in app storage is either from an older build, or newer than the keychain's: written
  // while the keychain refused a save. The keychain's own copy wins only when it is the newer one
  // (an older copy there would carry a refresh token the server already rotated).
  if (secured && !(legacy && (legacy.savedAt ?? 0) > (secured.savedAt ?? 0))) {
    return withoutStamp(secured)
  }
  if (!legacy) return null
  // It moves into the keychain (and out of app storage) as soon as the keychain accepts it.
  const session = withoutStamp(legacy)
  await saveAuthSession(session)
  return session
}

let writes: Promise<void> = Promise.resolve()

/**
 * Session writes run one at a time, in the order they were asked for: two overlapping saves (a
 * token refresh right after a sign-in) could otherwise interleave, and the older one's cleanup
 * after a refused keychain write would erase the newer copy.
 */
function serially(work: () => Promise<void>): Promise<void> {
  const next = writes.then(work, work)
  writes = next.catch(() => undefined)
  return next
}

export function saveAuthSession(session: PersistedAuthSession): Promise<void> {
  const stored: StoredSession = { ...session, savedAt: stamp() }
  return serially(() => writeSession(stored))
}

async function writeSession(stored: StoredSession): Promise<void> {
  const secure = keychain()
  if (secure) {
    try {
      await secure.setGenericPassword(KEYCHAIN_ACCOUNT, JSON.stringify(stored), {
        service: KEYCHAIN_SERVICE,
        // Never synced to other devices or restored from a backup onto another phone.
        accessible: secure.ACCESSIBLE?.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      })
      await removeLegacy()
      return
    } catch {
      // Fall through to app storage so the user is not signed out by a keychain hiccup. The
      // keychain's copy is now stale: dropped if possible (the newer stamp wins on load anyway).
      try {
        await secure.resetGenericPassword({ service: KEYCHAIN_SERVICE })
      } catch {
        // ignore
      }
    }
  }
  try {
    await AsyncStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(stored))
  } catch {
    // Ignore persistence failures — in-memory session still works for this run.
  }
}

export function clearAuthSession(): Promise<void> {
  return serially(removeSession)
}

async function removeSession(): Promise<void> {
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
