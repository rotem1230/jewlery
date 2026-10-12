import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii } from '@/src/theme/tokens'

type BrandButtonProps = {
  label: string
  variant?: 'primary' | 'outline'
  onPress?: () => void
  flex?: boolean
  /** Figma studio sheet CTAs — 111×42 Hug. */
  hug?: boolean
  disabled?: boolean
}

/**
 * Figma primary / outline CTA.
 * Background lives on an inner View — NativeWind strips Pressable fills.
 */
export function BrandButton({
  label,
  variant = 'primary',
  onPress,
  flex = true,
  hug = false,
  disabled = false,
}: BrandButtonProps) {
  const primary = variant === 'primary'

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        hug ? styles.hug : flex ? styles.flex : styles.fullWidth,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <View style={[styles.base, primary ? styles.primary : styles.outline]}>
        <Text style={[styles.label, primary ? styles.labelPrimary : styles.labelOutline]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  fullWidth: {
    width: '100%',
  },
  hug: {
    width: 111,
  },
  pressed: {
    opacity: 0.9,
  },
  base: {
    width: '100%',
    minHeight: 42,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  outline: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    textAlign: 'center',
    flexShrink: 1,
  },
  labelPrimary: {
    color: colors.textInverse,
  },
  labelOutline: {
    color: colors.brand,
  },
})
