import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { useTranslation } from '@/src/i18n'
import { colors, heights, radii } from '@/src/theme/tokens'

type PhoneFieldProps = {
  label?: string
  value: string
  onChangeText: (value: string) => void
  countryCode?: string
  onPressCountry?: () => void
  error?: string
}

/** Figma phone input: +972 dropdown on the left, number field on the right. */
export function PhoneField({
  label,
  value,
  onChangeText,
  countryCode = '+972',
  onPressCountry,
  error,
}: PhoneFieldProps) {
  const { t } = useTranslation()

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.shell, error ? styles.shellError : null]}>
        <Pressable
          onPress={onPressCountry}
          disabled={!onPressCountry}
          style={styles.code}
          hitSlop={6}
        >
          <Text style={styles.codeText}>{countryCode}</Text>
          {onPressCountry ? (
            <ChevronDown size={20} color={colors.textPrimary} strokeWidth={1.75} />
          ) : null}
        </Pressable>
        <TextInput
          style={styles.input}
          textAlign="left"
          placeholder={t('phonePlaceholder')}
          placeholderTextColor={colors.formPlaceholder}
          keyboardType="phone-pad"
          value={value}
          onChangeText={onChangeText}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 4,
    alignItems: 'stretch',
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
  shellError: {
    borderColor: '#F04438',
  },
  error: {
    width: '100%',
    textAlign: 'right',
    fontSize: 12,
    color: '#F04438',
  },
  shell: {
    width: '100%',
    height: heights.field,
    flexDirection: 'row',
    direction: 'ltr',
    overflow: 'hidden',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.formBorder,
    backgroundColor: colors.surface,
    shadowColor: '#0A0D12',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: '100%',
  },
  codeText: {
    fontFamily: 'Heebo',
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    fontFamily: 'Heebo',
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 0.14,
    color: colors.textPrimary,
    textAlign: 'left',
  },
})
