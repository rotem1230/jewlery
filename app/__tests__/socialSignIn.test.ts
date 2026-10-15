import {
  appleSignInAvailable,
  isAppleSignInCancelled,
  profileFromAppleCredential,
  roleSetupAfterSocialSignUp,
  googleSignInConfigured,
} from '../src/lib/socialSignIn'

describe('Sign in with Apple', () => {
  it('is offered only on Apple devices that support it', () => {
    expect(appleSignInAvailable('ios', true)).toBe(true)
    expect(appleSignInAvailable('ios', false)).toBe(false)
    expect(appleSignInAvailable('android', true)).toBe(false)
  })

  it("sends Apple's identity token and, on the first sign-in, the name Apple shares only once", () => {
    expect(
      profileFromAppleCredential({
        identityToken: 'apple.jwt',
        fullName: { givenName: 'Rotem', familyName: 'Antsel' },
      }),
    ).toEqual({ idToken: 'apple.jwt', firstName: 'Rotem', lastName: 'Antsel' })
    expect(profileFromAppleCredential({ identityToken: 'apple.jwt', fullName: null })).toEqual({ idToken: 'apple.jwt' })
  })

  it('a credential without an identity token is an error, not a silent sign-in', () => {
    expect(() => profileFromAppleCredential({ identityToken: null })).toThrow('apple-signin-missing-token')
  })

  it('the user closing the Apple sheet is not shown as an error', () => {
    expect(isAppleSignInCancelled({ code: '1001' })).toBe(true)
    expect(isAppleSignInCancelled({ code: 1001 })).toBe(true)
    expect(isAppleSignInCancelled({ code: '1000' })).toBe(false)
    expect(isAppleSignInCancelled(new Error('network'))).toBe(false)
  })
})

describe('signing up as a jeweler with Apple or Google', () => {
  it('adds the jeweler role and makes it active (the server creates new accounts as designers)', () => {
    expect(roleSetupAfterSocialSignUp('JEWELER', { roles: ['DESIGNER'], activeRole: 'DESIGNER' })).toEqual({
      add: 'JEWELER',
      switchTo: 'JEWELER',
    })
  })

  it('an account that already has the role only switches to it; a designer needs nothing', () => {
    expect(roleSetupAfterSocialSignUp('JEWELER', { roles: ['DESIGNER', 'JEWELER'], activeRole: 'DESIGNER' })).toEqual({
      add: null,
      switchTo: 'JEWELER',
    })
    expect(roleSetupAfterSocialSignUp('DESIGNER', { roles: ['DESIGNER'], activeRole: 'DESIGNER' })).toEqual({
      add: null,
      switchTo: null,
    })
  })
})

describe('Google sign-in button', () => {
  it('is shown only once a Google client id is configured for the build', () => {
    expect(googleSignInConfigured('123.apps.googleusercontent.com')).toBe(true)
    expect(googleSignInConfigured('')).toBe(false)
    expect(googleSignInConfigured(undefined)).toBe(false)
  })
})

describe('the Apple sign-in request', () => {
  it("posts Apple's identity token (and name) to the server without a session", async () => {
    const calls: Array<{ url: string; body: unknown; authorization: string | null }> = []
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        authorization: new Headers(init?.headers).get('Authorization'),
      })
      const body = {
        success: true,
        data: {
          user: { id: 'u1', email: 'x@privaterelay.appleid.com', firstName: 'Rotem', lastName: null, roles: ['DESIGNER'], activeRole: 'DESIGNER' },
          tokens: { accessToken: 'a', refreshToken: 'r', expiresIn: '15m' },
        },
      }
      return { ok: true, status: 201, json: async () => body, text: async () => JSON.stringify(body) } as Response
    }) as unknown as typeof fetch

    const { oauthApple } = require('../src/api/auth')
    const { API_BASE_URL } = require('../src/lib/api')
    const result = await oauthApple({ idToken: 'apple.jwt', firstName: 'Rotem' })
    expect(calls[0].url).toBe(`${API_BASE_URL}/auth/oauth/apple`)
    expect(calls[0].body).toEqual({ idToken: 'apple.jwt', firstName: 'Rotem' })
    expect(calls[0].authorization).toBeNull()
    expect(result.user.firstName).toBe('Rotem')
  })
})
