import { View, Text, StyleSheet } from 'react-native'
import { Input } from './Input'
import type { TextInputProps } from 'react-native'
import { useTranslation } from '@/src/i18n'
import { cn } from '@/src/lib/cn'
import { colors } from '@/src/theme/tokens'

type FieldProps = TextInputProps & {
  label?: string
  hint?: string
  error?: string
  className?: string
}

/** Figma input-with-label: column, labels/placeholders visually right-aligned. */
export function Field({ label, hint, error, className, placeholder, ...inputProps }: FieldProps) {
  const { t } = useTranslation()
  return (
    <View className={cn('w-full', className)} style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Input
        error={Boolean(error)}
        placeholder={placeholder ?? t('typeHere')}
        className="w-full"
        {...inputProps}
      />
      {error || hint ? (
        <Text style={[styles.hint, error ? styles.hintError : null]}>{error ?? hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'stretch',
    gap: 4,
  },
  label: {
    width: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
    fontFamily: 'Heebo',
    fontSize: 12,
    lineHeight: 13,
    letterSpacing: -0.12,
    color: colors.formLabel,
    fontWeight: '400',
  },
  hint: {
    width: '100%',
    textAlign: 'right',
    fontSize: 12,
    color: colors.textSecondary,
  },
  hintError: {
    color: '#F04438',
  },
})
