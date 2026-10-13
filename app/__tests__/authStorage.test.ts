const LEGACY_KEY = '@malinvosky/auth_session'
const session = {
  user: { id: 'u1', email: 'a@b.c', roles: ['DESIGNER' as const], activeRole: 'DESIGNER' as const },
  accessToken: 'access',
  refreshToken: 'refresh',
}

type Stored = { username: string; password: string; service?: string; accessible?: string }

function fakeKeychain() {
  const items = new Map<string, Stored>()
  return {
    items,
    ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly' },
    setGenericPassword: jest.fn(async (username: string, password: string, options?: { service?: string; accessible?: string }) => {
      items.set(options?.service ?? 'default', { username, password, ...options })
      return true
    }),
    getGenericPassword: jest.fn(async (options?: { service?: string }) => items.get(options?.service ?? 'default') ?? false),
    resetGenericPassword: jest.fn(async (options?: { service?: string }) => items.delete(options?.service ?? 'default')),
  }
}

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; clear(): Promise<void> }

/** Fresh module registry per test: the storage module and the AsyncStorage mock it uses. */
function load() {
  const AsyncStorage = (require('@react-native-async-storage/async-storage') as { default: Storage }).default
  const storage = require('../src/store/authStorage') as typeof import('../src/store/authStorage')
  return { AsyncStorage, storage }
}

describe('session storage', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('keeps the session in the keychain, not in plain app storage', async () => {
    const keychain = fakeKeychain()
    jest.doMock('react-native-keychain', () => keychain)
    const { AsyncStorage, storage } = load()

    await storage.saveAuthSession(session)
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull()
    const [stored] = [...keychain.items.values()]
    expect(JSON.parse(stored.password)).toEqual({ ...session, savedAt: expect.any(Number) })
    expect(stored.accessible).toBe('AccessibleAfterFirstUnlockThisDeviceOnly')
    expect(await storage.loadAuthSession()).toEqual(session)
  })

  it('moves a session saved by an older version into the keychain', async () => {
    const keychain = fakeKeychain()
    jest.doMock('react-native-keychain', () => keychain)
    const { AsyncStorage, storage } = load()
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(session))

    expect(await storage.loadAuthSession()).toEqual(session)
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(keychain.items.size).toBe(1)
  })

  it('signing out clears every copy', async () => {
    const keychain = fakeKeychain()
    jest.doMock('react-native-keychain', () => keychain)
    const { AsyncStorage, storage } = load()
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(session))
    await storage.saveAuthSession(session)

    await storage.clearAuthSession()
    expect(keychain.items.size).toBe(0)
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(await storage.loadAuthSession()).toBeNull()
  })

  it('a session saved while the keychain fails is not hidden by the older keychain copy', async () => {
    const keychain = fakeKeychain()
    jest.doMock('react-native-keychain', () => keychain)
    const { storage } = load()
    await storage.saveAuthSession(session)
    const rotated = { ...session, accessToken: 'access-2', refreshToken: 'refresh-2' }
    keychain.setGenericPassword.mockRejectedValueOnce(new Error('keystore unavailable'))
    await storage.saveAuthSession(rotated)

    expect(await storage.loadAuthSession()).toEqual(rotated)
  })

  it('the newer session wins even when the stale keychain copy cannot be removed', async () => {
    const keychain = fakeKeychain()
    jest.doMock('react-native-keychain', () => keychain)
    const { AsyncStorage, storage } = load()
    await storage.saveAuthSession(session)
    const rotated = { ...session, accessToken: 'access-2', refreshToken: 'refresh-2' }
    keychain.setGenericPassword.mockRejectedValueOnce(new Error('keystore unavailable'))
    keychain.resetGenericPassword.mockRejectedValueOnce(new Error('keystore unavailable'))
    await storage.saveAuthSession(rotated)

    expect(await storage.loadAuthSession()).toEqual(rotated)
    // Once the keychain works again the newer session moves in and the plain copy is gone.
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(await storage.loadAuthSession()).toEqual(rotated)
  })

  it('overlapping saves end with the newer session, even when the older one fails its keychain write', async () => {
    const keychain = fakeKeychain()
    jest.doMock('react-native-keychain', () => keychain)
    const { storage } = load()
    const older = { ...session, accessToken: 'access-1', refreshToken: 'refresh-1' }
    const newer = { ...session, accessToken: 'access-2', refreshToken: 'refresh-2' }
    let failOlder: (() => void) | undefined
    keychain.setGenericPassword.mockImplementationOnce(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          failOlder = () => reject(new Error('keystore busy'))
        }),
    )
    // Saved one after the other without waiting (a token refresh right after a sign-in).
    const first = storage.saveAuthSession(older)
    const second = storage.saveAuthSession(newer)
    while (!failOlder) await new Promise<void>((resolve) => setTimeout(() => resolve(), 0))
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0))
    failOlder()
    await Promise.all([first, second])

    expect(await storage.loadAuthSession()).toEqual(newer)
  })

  it('still works when the native keychain module is not linked', async () => {
    jest.doMock('react-native-keychain', () => {
      throw new Error('native module not linked')
    })
    const { storage } = load()

    await storage.saveAuthSession(session)
    expect(await storage.loadAuthSession()).toEqual(session)
  })
})
