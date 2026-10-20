import { Alert } from 'react-native'
import renderer, { act } from 'react-test-renderer'
import { oauthApple } from '../src/api/auth'
import { useSocialSignIn } from '../src/hooks/useSocialSignIn'
import { ApiError } from '../src/lib/api'

jest.mock('../src/api/auth', () => ({ oauthApple: jest.fn(), oauthGoogle: jest.fn() }))
jest.mock('../src/lib/googleSignIn', () => ({ signInWithGoogleNative: jest.fn() }))
jest.mock('../src/lib/socialSignIn', () => ({
  signInWithAppleNative: jest.fn(async () => ({ idToken: 'apple-token', firstName: 'דנה' })),
  isAppleSignInCancelled: () => false,
  roleSetupAfterSocialSignUp: () => ({ add: null, switchTo: null }),
}))
jest.mock('../src/lib/session', () => ({ sessionFromAuth: (result: unknown) => result }))
jest.mock('../src/store/authActions', () => ({ addAccountRole: jest.fn(), switchAccountRole: jest.fn() }))
jest.mock('../src/store/hooks', () => ({ useAppDispatch: () => jest.fn(async () => undefined) }))
jest.mock('../src/store/store', () => ({ setSession: (session: unknown) => ({ type: 'session', session }) }))

type Hook = ReturnType<typeof useSocialSignIn>

async function mount(options: Parameters<typeof useSocialSignIn>[0]): Promise<Hook> {
  let hook!: Hook
  function Harness() {
    hook = useSocialSignIn(options)
    return null
  }
  await act(async () => {
    renderer.create(<Harness />)
  })
  return hook
}

const AUTH = { user: { id: 'u1', roles: ['DESIGNER'], activeRole: 'DESIGNER' }, tokens: { accessToken: 'a', refreshToken: 'r' } }

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

describe('Apple / Google and the terms', () => {
  it('signing up sends the terms accepted, the version shown and the marketing choice', async () => {
    ;(oauthApple as jest.Mock).mockResolvedValue(AUTH)
    const hook = await mount({
      persist: true,
      signUpRole: 'DESIGNER',
      setBusy: jest.fn(),
      consent: { acceptTerms: true, termsVersion: 1, marketingConsent: false },
    })
    await act(async () => hook.withApple())
    expect(oauthApple).toHaveBeenCalledWith({ idToken: 'apple-token', firstName: 'דנה', acceptTerms: true, termsVersion: 1, marketingConsent: false })
  })

  it('from the sign-in screen, a new account is sent to sign up (the terms first), not shown an error', async () => {
    ;(oauthApple as jest.Mock).mockRejectedValue(
      new ApiError(403, '/auth/oauth/apple', JSON.stringify({ code: 'TERMS_REQUIRED', message: 'Accept the terms' })),
    )
    const onTermsRequired = jest.fn()
    const hook = await mount({ persist: true, setBusy: jest.fn(), onTermsRequired })
    await act(async () => hook.withApple())
    expect(oauthApple).toHaveBeenCalledWith({ idToken: 'apple-token', firstName: 'דנה' })
    expect(onTermsRequired).toHaveBeenCalled()
    expect(Alert.alert).not.toHaveBeenCalled()
  })
})
