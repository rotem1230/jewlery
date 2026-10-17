import { Alert } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { register } from '../src/api/auth'
import { t } from '../src/i18n'
import { SignupScreen } from '../src/screens/auth/SignupScreen'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('../src/api/auth', () => ({ register: jest.fn(async () => ({ ok: true })), resendVerification: jest.fn() }))
jest.mock('../src/hooks/useSocialSignIn', () => ({ useSocialSignIn: () => ({ withApple: jest.fn(), withGoogle: jest.fn() }) }))
jest.mock('../src/components/auth/AppleAuthButton', () => ({ AppleAuthButton: () => null }))
jest.mock('../src/components/auth/GoogleAuthButton', () => ({ GoogleAuthButton: () => null }))
jest.mock('../src/components/auth/AuthScreenLayout', () => {
  // Not `createElement`: NativeWind's Babel plugin rewrites that name into an out-of-scope import.
  const mockReact = require('react')
  return {
    AuthScreenLayout: ({ top, bottom }: { top: unknown; bottom: unknown }) =>
      mockReact.createElement(mockReact.Fragment, null, top, bottom),
  }
})
jest.mock('../src/components/auth/PhoneField', () => ({ PhoneField: () => null }))
jest.mock('../src/components/ui', () => {
  const mockReact = require('react')
  const rn = require('react-native')
  return {
    Button: ({ children, onPress }: { children: unknown; onPress?: () => void }) =>
      mockReact.createElement(rn.Pressable, { onPress, testID: 'button' }, mockReact.createElement(rn.Text, null, children)),
    Field: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) =>
      mockReact.createElement(rn.TextInput, { accessibilityLabel: label, value, onChangeText }),
    Checkbox: ({ onChange }: { onChange: (checked: boolean) => void }) =>
      mockReact.createElement(rn.Pressable, { testID: 'terms', onPress: () => onChange(true) }),
  }
})

jest.setTimeout(60_000)

describe('sign-up confirmation', () => {
  it('names the e-mail address as one left-to-right run inside the Hebrew sentence', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const navigation = { navigate: jest.fn(), goBack: jest.fn() }
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(
        <SignupScreen navigation={navigation as never} route={{ key: 'Signup', name: 'Signup', params: undefined } as never} />,
      )
    })
    const field = (label: string) => tree.root.find((node) => node.props.accessibilityLabel === label)
    await act(async () => {
      field(t('email')).props.onChangeText('qa.designer@malinvosky.test')
      field(t('password')).props.onChangeText('Str0ng-Pass!')
      field(t('fullName')).props.onChangeText('QA Designer')
    })
    await act(async () => {
      tree.root.findByProps({ testID: 'terms' }).props.onPress()
    })
    await act(async () => {
      tree.root.findByProps({ testID: 'button' }).props.onPress()
    })

    expect(register).toHaveBeenCalledWith(expect.objectContaining({ email: 'qa.designer@malinvosky.test' }))
    const [title, message] = alert.mock.calls[0]
    expect(title).toBe(t('authVerifyEmailTitle'))
    const LRI = String.fromCharCode(0x2066)
    const PDI = String.fromCharCode(0x2069)
    expect(message).toContain(`${LRI}qa.designer@malinvosky.test${PDI}`)
    alert.mockRestore()
    await act(async () => tree.unmount())
  })
})
