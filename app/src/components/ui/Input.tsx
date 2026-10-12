import { Platform, TextInput, type TextInputProps, StyleSheet, View } from 'react-native'
import { cn } from '@/src/lib/cn'
import { colors, heights, radii } from '@/src/theme/tokens'

type InputProps = TextInputProps & {
  error?: boolean
  className?: string
}

/** Figma text field — right-aligned value, vertically centered in the shell. */
export function Input({ error, className, style, textAlign, ...props }: InputProps) {
  return (
    <View
      className={cn('w-full', className)}
      style={[styles.shell, error ? styles.shellError : null]}
    >
      <TextInput
        placeholderTextColor={colors.formPlaceholder}
        textAlignVertical="center"
        underlineColorAndroid="transparent"
        {...props}
        textAlign={textAlign ?? 'right'}
        style={[styles.input, style]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    height: heights.field,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.formBorder,
    backgroundColor: colors.surface,
    shadowColor: '#0A0D12',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shellError: {
    borderColor: '#F04438',
  },
  input: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
    fontFamily: 'Heebo',
    fontSize: 16,
    // Avoid fixed lineHeight — it throws iOS vertical centering off in short fields.
    color: colors.textPrimary,
    textAlign: 'right',
    ...(Platform.OS === 'android'
      ? { textAlignVertical: 'center' as const, includeFontPadding: false }
      : null),
  },
})
