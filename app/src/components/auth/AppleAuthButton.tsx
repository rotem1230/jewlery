import type { ComponentType } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { isAppleSignInSupported } from '@/src/lib/socialSignIn'
import { heights, radii } from '@/src/theme/tokens'

type AppleButtonComponent = ComponentType<{
  buttonStyle: number
  buttonType: number
  cornerRadius?: number
  style?: ViewStyle
  onPress: () => void
}> & { Style: { BLACK: number }; Type: { CONTINUE: number } }

type AppleAuthButtonProps = {
  onPress: () => void
}

/**
 * Apple's own "Continue with Apple" button (App Store guidelines require its standard look).
 * Rendered only on Apple devices that support Sign in with Apple; elsewhere it renders nothing.
 */
export function AppleAuthButton({ onPress }: AppleAuthButtonProps) {
  if (!isAppleSignInSupported()) {
    return null
  }
  // Required here, not at the top: the native module exists only in the iOS app.
  const { AppleButton } = require('@invertase/react-native-apple-authentication') as {
    AppleButton: AppleButtonComponent
  }
  return (
    <View style={styles.wrap}>
      <AppleButton
        buttonStyle={AppleButton.Style.BLACK}
        buttonType={AppleButton.Type.CONTINUE}
        cornerRadius={radii.md}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  button: {
    width: '100%',
    height: heights.buttonGoogle,
  },
})
