import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { colors, spacing } from '@/src/theme/tokens'

type ScreenTopBarProps = {
  title: string
  onBack?: () => void
  /** Hide the trailing spacer so title stays centered with a back button. */
  showBack?: boolean
}

/** Figma Mobile Header content row — back + centered title + trailing balance. */
export function ScreenTopBar({ title, onBack, showBack = true }: ScreenTopBarProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            style={styles.side}
          >
            <ChevronLeft size={24} color={colors.ink} strokeWidth={1.5} />
          </Pressable>
        ) : (
          <View style={styles.side} />
        )}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.side} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  row: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: spacing.page,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  side: {
    width: 50,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.ink,
    textAlign: 'center',
  },
})
