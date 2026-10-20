import { Alert, Text } from 'react-native'
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { register } from '../src/api/auth'
import { t } from '../src/i18n'
import { useSocialSignIn } from '../src/hooks/useSocialSignIn'
import { SignupScreen } from '../src/screens/auth/SignupScreen'

// NativeWind's runtime ships untranspiled JSX; plain React renders these screens the same in a test.
jest.mock('nativewind/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'))
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }))
jest.mock('../src/api/auth', () => ({ register: jest.fn(async () => ({ ok: true })), resendVerification: jest.fn() }))
jest.mock('../src/hooks/useSocialSignIn', () => ({ useSocialSignIn: jest.fn(() => ({ withApple: jest.fn(), withGoogle: jest.fn() })) }))
// The version of the terms the links open (sent with the acceptance).
jest.mock('../src/api/subscriptions', () => ({ getContentPage: jest.fn(async () => ({ id: 'tos-1', slug: 'tos', locale: 'he', title: 'תקנון', version: 1, body: {} })) }))
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
    Checkbox: ({ onChange, checked, testID, labelNode, label }: { onChange: (checked: boolean) => void; checked: boolean; testID?: string; labelNode?: unknown; label?: string }) =>
      mockReact.createElement(rn.Pressable, { testID, onPress: () => onChange(!checked) }, labelNode ?? mockReact.createElement(rn.Text, null, label)),
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
      tree.root.find((node) => node.props.testID === 'terms' && typeof node.props.onPress === 'function').props.onPress()
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

describe('the terms and the marketing choice (click-wrap)', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() }

  async function open(): Promise<ReactTestRenderer> {
    let tree!: ReactTestRenderer
    await act(async () => {
      tree = renderer.create(
        <SignupScreen navigation={navigation as never} route={{ key: 'Signup', name: 'Signup', params: undefined } as never} />,
      )
    })
    return tree
  }

  async function fill(tree: ReactTestRenderer) {
    const field = (label: string) => tree.root.find((node) => node.props.accessibilityLabel === label)
    await act(async () => {
      field(t('email')).props.onChangeText('dana@example.com')
      field(t('password')).props.onChangeText('Str0ng-Pass!')
      field(t('fullName')).props.onChangeText('דנה כהן')
    })
  }

  const box = (tree: ReactTestRenderer, id: string) => tree.root.find((node) => node.props.testID === id && typeof node.props.onPress === 'function')
  const submit = (tree: ReactTestRenderer) => tree.root.findByProps({ testID: 'button' }).props.onPress()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('says the exact sentence, with "תנאי השימוש" and "מדיניות הפרטיות" opening the terms and the privacy part', async () => {
    const tree = await open()
    const sentence = box(tree, 'terms').findAllByType(Text)[0]
    const flat = (node: unknown): string =>
      typeof node === 'string' ? node : Array.isArray(node) ? node.map(flat).join('') : node && typeof node === 'object' && 'props' in node ? flat((node as { props: { children: unknown } }).props.children) : ''
    expect(flat(sentence.props.children)).toBe('אני מאשר שקראתי ואני מסכים לתנאי השימוש ומדיניות הפרטיות של האפליקציה')
    const links = box(tree, 'terms').findAll((node) => node.type === Text && typeof node.props.onPress === 'function')
    expect(links.map((link) => link.props.children)).toEqual(['תנאי השימוש', 'מדיניות הפרטיות'])
    links[0].props.onPress()
    links[1].props.onPress()
    expect(navigation.navigate).toHaveBeenNthCalledWith(1, 'Terms')
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, 'Terms', { section: 'privacy' })
    expect(box(tree, 'terms').props.onPress).toBeDefined()
    expect(tree.root.findAll((node) => node.type === Text && node.props.children === 'אני מסכים לקבל מהאפליקציה דיוור ישיר, עדכונים, תוכן שיווקי ומבצעים בדואר אלקטרוני ובמסרונים')).toHaveLength(1)
    await act(async () => tree.unmount())
  })

  it('no account without the terms box', async () => {
    const tree = await open()
    await fill(tree)
    await act(async () => submit(tree))
    expect(register).not.toHaveBeenCalled()
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe(t('authNeedTerms'))
    await act(async () => tree.unmount())
  })

  it('sends the acceptance with the version shown; marketing is off unless its own box is ticked', async () => {
    const tree = await open()
    await fill(tree)
    await act(async () => box(tree, 'terms').props.onPress())
    await act(async () => submit(tree))
    expect(register).toHaveBeenLastCalledWith(expect.objectContaining({ acceptTerms: true, termsVersion: 1, marketingConsent: false }))

    await act(async () => box(tree, 'marketing').props.onPress())
    await act(async () => submit(tree))
    expect(register).toHaveBeenLastCalledWith(expect.objectContaining({ acceptTerms: true, termsVersion: 1, marketingConsent: true }))
    // Apple / Google sign-up carry the same choices.
    expect(useSocialSignIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ consent: { acceptTerms: true, termsVersion: 1, marketingConsent: true } }),
    )
    await act(async () => tree.unmount())
  })
})
