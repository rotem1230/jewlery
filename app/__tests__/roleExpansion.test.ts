jest.mock('../src/store/authStorage', () => ({
  loadAuthSession: jest.fn(async () => null),
  saveAuthSession: jest.fn(async () => undefined),
  clearAuthSession: jest.fn(async () => undefined),
}))

import { addRole } from '../src/api/auth'
import { profileMenuItems, roleToAdd, roleToSwitch } from '../src/lib/accountRoles'
import { API_BASE_URL } from '../src/lib/api'
import { addAccountRole, switchAccountRole } from '../src/store/authActions'
import { saveAuthSession } from '../src/store/authStorage'
import { clearSession, setSession, store } from '../src/store/store'

type Call = { url: string; body: unknown; authorization: string | null }

const calls: Call[] = []

function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
}

function serve(handler: (url: string) => Response) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: new Headers(init?.headers).get('Authorization'),
    })
    return handler(String(input))
  }) as unknown as typeof fetch
}

function authResult(roles: Array<'DESIGNER' | 'JEWELER'>, activeRole: 'DESIGNER' | 'JEWELER', token: string) {
  return {
    success: true,
    data: {
      user: { id: 'u1', email: 'a@b.c', firstName: 'Dana', lastName: null, roles, activeRole },
      tokens: { accessToken: `access-${token}`, refreshToken: `refresh-${token}`, expiresIn: '15m' },
    },
  }
}

const designer = { id: 'u1', email: 'a@b.c', firstName: 'Dana', lastName: null, roles: ['DESIGNER' as const], activeRole: 'DESIGNER' as const }

describe('which role an account can still take on (PRD 5.1)', () => {
  it('offers the missing marketplace role, and nothing once the account has both', () => {
    expect(roleToAdd(['DESIGNER'])).toBe('JEWELER')
    expect(roleToAdd(['JEWELER'])).toBe('DESIGNER')
    expect(roleToAdd(['DESIGNER', 'JEWELER'])).toBeNull()
    expect(roleToAdd(['ADMIN'])).toBeNull()
  })

  it('switching is offered only between roles the account holds', () => {
    expect(roleToSwitch({ roles: ['DESIGNER'], activeRole: 'DESIGNER' })).toBeNull()
    expect(roleToSwitch({ roles: ['DESIGNER', 'JEWELER'], activeRole: 'DESIGNER' })).toBe('JEWELER')
    expect(roleToSwitch({ roles: ['DESIGNER', 'JEWELER'], activeRole: 'JEWELER' })).toBe('DESIGNER')
    expect(roleToSwitch(null)).toBeNull()
  })
})

describe('profile menu', () => {
  it('jewelers reach the plans (pricing) screen too', () => {
    expect(profileMenuItems('JEWELER').map((item) => item.route)).toContain('Pricing')
    expect(profileMenuItems('DESIGNER').map((item) => item.route)).toContain('Pricing')
  })

  it('only an admin sees the admin entry', () => {
    expect(profileMenuItems('DESIGNER', ['DESIGNER', 'ADMIN']).map((item) => item.route)).toContain('AdminHome')
    expect(profileMenuItems('JEWELER', ['JEWELER', 'ADMIN']).map((item) => item.route)).toContain('AdminHome')
    expect(profileMenuItems('DESIGNER', ['DESIGNER']).map((item) => item.route)).not.toContain('AdminHome')
    expect(profileMenuItems('DESIGNER').map((item) => item.route)).not.toContain('AdminHome')
  })
})

describe('adding a role to the signed-in account', () => {
  beforeEach(() => {
    calls.length = 0
    store.dispatch(clearSession())
    ;(saveAuthSession as jest.Mock).mockClear()
  })

  it('asks the server for the role with the session token', async () => {
    store.dispatch(setSession({ user: designer, accessToken: 'access-0', refreshToken: 'refresh-0', persist: true }))
    serve(() => respond(201, authResult(['DESIGNER', 'JEWELER'], 'DESIGNER', '1')))
    await addRole('JEWELER')
    expect(calls[0].url).toBe(`${API_BASE_URL}/auth/roles`)
    expect(calls[0].body).toEqual({ role: 'JEWELER' })
    expect(calls[0].authorization).toBe('Bearer access-0')
  })

  it('stores the new roles and tokens, keeps the active role and the remember-me choice', async () => {
    store.dispatch(setSession({ user: designer, accessToken: 'access-0', refreshToken: 'refresh-0', persist: true }))
    serve(() => respond(201, authResult(['DESIGNER', 'JEWELER'], 'DESIGNER', '1')))

    await store.dispatch(addAccountRole('JEWELER'))

    const { user, accessToken, refreshToken, persist } = store.getState().auth
    expect(user?.roles).toEqual(['DESIGNER', 'JEWELER'])
    expect(user?.activeRole).toBe('DESIGNER')
    expect(accessToken).toBe('access-1')
    expect(refreshToken).toBe('refresh-1')
    expect(persist).toBe(true)
    expect(saveAuthSession).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'access-1' }))
  })

  it('a session the user chose not to remember stays unsaved after adding a role', async () => {
    store.dispatch(setSession({ user: designer, accessToken: 'access-0', refreshToken: 'refresh-0', persist: false }))
    serve(() => respond(201, authResult(['DESIGNER', 'JEWELER'], 'DESIGNER', '1')))
    await store.dispatch(addAccountRole('JEWELER'))
    expect(saveAuthSession).not.toHaveBeenCalled()
  })

  it('then switches to the new role on request', async () => {
    store.dispatch(setSession({ user: designer, accessToken: 'access-0', refreshToken: 'refresh-0', persist: true }))
    serve(() => respond(201, authResult(['DESIGNER', 'JEWELER'], 'DESIGNER', '1')))
    await store.dispatch(addAccountRole('JEWELER'))

    serve(() => respond(201, authResult(['DESIGNER', 'JEWELER'], 'JEWELER', '2')))
    await store.dispatch(switchAccountRole('JEWELER'))
    expect(calls[calls.length - 1].url).toBe(`${API_BASE_URL}/auth/switch-role`)
    expect(calls[calls.length - 1].body).toEqual({ role: 'JEWELER' })
    expect(store.getState().auth.user?.activeRole).toBe('JEWELER')
    expect(store.getState().auth.accessToken).toBe('access-2')
  })

  it('a refused request leaves the session as it was and reports the error', async () => {
    store.dispatch(setSession({ user: designer, accessToken: 'access-0', refreshToken: 'refresh-0', persist: true }))
    serve(() => respond(400, { success: false, message: 'role must be one of the following values' }))
    await expect(store.dispatch(addAccountRole('JEWELER'))).rejects.toMatchObject({ status: 400 })
    expect(store.getState().auth.user?.roles).toEqual(['DESIGNER'])
    expect(store.getState().auth.accessToken).toBe('access-0')
  })
})
