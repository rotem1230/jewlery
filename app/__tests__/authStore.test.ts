jest.mock('../src/store/authStorage', () => ({
  loadAuthSession: jest.fn(async () => null),
  saveAuthSession: jest.fn(async () => undefined),
  clearAuthSession: jest.fn(async () => undefined),
}))

import { clearAuthSession, saveAuthSession } from '../src/store/authStorage'
import { clearSession, setActiveRole, setSession, store } from '../src/store/store'

const user = { id: 'u1', email: 'a@b.c', roles: ['DESIGNER' as const, 'JEWELER' as const], activeRole: 'DESIGNER' as const }
const saved = saveAuthSession as jest.Mock
const cleared = clearAuthSession as jest.Mock

describe('remembering the session', () => {
  beforeEach(() => {
    store.dispatch(clearSession())
    saved.mockClear()
    cleared.mockClear()
  })

  it('a session the user chose not to remember is not saved when its tokens are refreshed or its role changes', () => {
    store.dispatch(setSession({ user, accessToken: 'a1', refreshToken: 'r1', persist: false }))
    expect(cleared).toHaveBeenCalled()

    // What a token refresh and a role switch dispatch: no remember-me choice of their own.
    store.dispatch(setSession({ user, accessToken: 'a2', refreshToken: 'r2' }))
    store.dispatch(setActiveRole('JEWELER'))
    expect(saved).not.toHaveBeenCalled()
    expect(store.getState().auth.accessToken).toBe('a2')
  })

  it('a remembered session is saved again with the refreshed tokens', () => {
    store.dispatch(setSession({ user, accessToken: 'a1', refreshToken: 'r1', persist: true }))
    store.dispatch(setSession({ user, accessToken: 'a2', refreshToken: 'r2' }))
    expect(saved).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'a2', refreshToken: 'r2' }))
  })

  it('"remember me" off survives a lost session and a sign-in that states no choice of its own', () => {
    store.dispatch(setSession({ user, accessToken: 'a1', refreshToken: 'r1', persist: false }))
    // The server ended the session (e.g. a password change); the app signs in again with the new password.
    store.dispatch(clearSession())
    store.dispatch(setSession({ user, accessToken: 'a2', refreshToken: 'r2' }))
    expect(saved).not.toHaveBeenCalled()
  })

  it('after signing out, the next sign-in with "remember me" is saved', () => {
    store.dispatch(setSession({ user, accessToken: 'a1', refreshToken: 'r1', persist: false }))
    store.dispatch(clearSession())
    store.dispatch(setSession({ user, accessToken: 'a3', refreshToken: 'r3', persist: true }))
    expect(saved).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'a3' }))
  })
})
