import type { ReactNode } from 'react'
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

type PressableBoxProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>
  /** Added while pressed (e.g. a slight fade). */
  pressedStyle?: StyleProp<ViewStyle>
  children?: ReactNode
}

/**
 * A Pressable whose look lives on an inner View. NativeWind's interop drops a Pressable `style`
 * given as a function (`({ pressed }) => …`), which silently lost backgrounds, padding and widths;
 * a plain style on a View is kept.
 */
export function PressableBox({ style, pressedStyle, children, ...props }: PressableBoxProps) {
  return (
    <Pressable {...props}>
      {({ pressed }) => <View style={[style, pressed && pressedStyle]}>{children}</View>}
    </Pressable>
  )
}
