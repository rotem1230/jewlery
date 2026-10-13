import { Alert, TextInput } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { forgotPassword } from '../src/api/auth'
import { t } from '../src/i18n'
import { ForgotPasswordScreen } from '../src/screens/auth/ForgotPasswordScreen'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('../src/api/auth', () => ({ forgotPassword: jest.fn(async () => ({ ok: true })) }))
jest.mock('../src/components/auth/AuthScreenLayout', () => {
  // Not `createElement`: NativeWind's Babel plugin rewrites that name into an out-of-scope import.
  const mockReact = require('react')
  return {
    AuthScreenLayout: ({ top, bottom }: { top: unknown; bottom: unknown }) =>
      mockReact.createElement(mockReact.Fragment, null, top, bottom),
  }
})
jest.mock('../src/components/ui', () => {
  const mockReact = require('react')
  const rn = require('react-native')
  return {
    Button: ({ children, onPress }: { children: unknown; onPress?: () => void }) =>
      mockReact.createElement(rn.Pressable, { onPress }, mockReact.createElement(rn.Text, null, children)),
    Field: ({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) =>
      mockReact.createElement(rn.TextInput, { value, onChangeText }),
  }
})

describe('forgot password', () => {
  it('confirms a sent reset link under a success title, not the error title', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const navigation = { navigate: jest.fn(), goBack: jest.fn() }
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(
        <ForgotPasswordScreen
          navigation={navigation as never}
          route={{ key: 'ForgotPassword', name: 'ForgotPassword', params: undefined } as never}
        />,
      )
    })
    await act(async () => {
      tree.root.findByType(TextInput).props.onChangeText('designer@example.com')
    })
    await act(async () => {
      // The first button is "send reset link" (the second is cancel).
      tree.root.findAll((node) => typeof node.props.onPress === 'function')[0].props.onPress()
    })

    expect(forgotPassword).toHaveBeenCalledWith('designer@example.com')
    expect(alert).toHaveBeenCalledTimes(1)
    const [title, message] = alert.mock.calls[0]
    expect(title).toBe(t('shAuthForgotSentTitle'))
    expect(title).not.toBe(t('authErrorTitle'))
    expect(message).toBe(t('authForgotSent'))
    alert.mockRestore()
  })
})
