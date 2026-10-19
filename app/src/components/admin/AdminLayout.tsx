import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { ErrorState } from '@/src/components/ui/ErrorState'
import type { RangeKind } from '@/src/lib/admin'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'

/** An admin screen: title with back, pull to refresh, and the loading / error states of its data. */
export function AdminScreen({
  title,
  children,
  loading,
  error,
  refreshing,
  onRefresh,
  onRetry,
}: {
  title: string
  children: ReactNode
  loading?: boolean
  error?: unknown
  refreshing?: boolean
  onRefresh?: () => void
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  const navigation = useNavigation()
  return (
    <View style={styles.root}>
      <ScreenTopBar title={title} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {error && !loading ? (
          <ErrorState title={t('commonLoadingErrorTitle')} message={t('commonLoadingErrorMessage')} retryLabel={t('commonRetry')} onRetry={onRetry ?? (() => undefined)} />
        ) : loading ? (
          <ActivityIndicator style={styles.loading} color={colors.brand} />
        ) : (
          children
        )}
      </ScrollView>
    </View>
  )
}

export function AdminCard({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const body = <View style={styles.card}>{children}</View>
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  ) : (
    body
  )
}

export function AdminTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function AdminText({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.text, muted ? styles.muted : null]}>{children}</Text>
}

/** A label and its value on one line (RTL: label at the right). */
export function AdminRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.value, strong ? styles.strong : null]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

/** One of a few choices (report range, tab). */
export function AdminChips<T extends string>({ options, value, onChange }: { options: Array<{ key: T; label: string }>; value: T; onChange: (key: T) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Pressable
          key={option.key}
          accessibilityRole="button"
          accessibilityState={{ selected: option.key === value }}
          onPress={() => onChange(option.key)}
          style={[styles.chip, option.key === value ? styles.chipOn : null]}
        >
          <Text style={[styles.chipText, option.key === value ? styles.chipTextOn : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

export function useRangeOptions(): Array<{ key: RangeKind; label: string }> {
  const { t } = useTranslation()
  return [
    { key: 'this_month', label: t('admRangeThisMonth') },
    { key: 'last_month', label: t('admRangeLastMonth') },
    { key: 'last_90_days', label: t('admRange90') },
  ]
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.homeBg },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  loading: { paddingVertical: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 14,
    gap: 8,
  },
  pressed: { opacity: 0.7 },
  title: { fontFamily: 'Heebo', fontSize: 17, fontWeight: '600', color: colors.ink, textAlign: 'right', writingDirection: 'rtl' },
  text: { fontFamily: 'Heebo', fontSize: 14, color: colors.ink, textAlign: 'right', writingDirection: 'rtl' },
  muted: { color: colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontFamily: 'Heebo', fontSize: 14, color: colors.textSecondary, textAlign: 'right', writingDirection: 'rtl' },
  value: { fontFamily: 'Heebo', fontSize: 14, color: colors.ink, textAlign: 'left' },
  strong: { fontWeight: '700' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.brand },
  chipOn: { backgroundColor: colors.brand },
  chipText: { fontFamily: 'Heebo', fontSize: 14, color: colors.brand },
  chipTextOn: { color: '#FFFFFF' },
})
