import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/src/theme/tokens'

type QuoteApprovedBannerProps = {
  title: string
  body: string
  linkLabel: string
  onPressLink?: () => void
}

/**
 * Figma chat system card — quote approved success + jeweler contact link.
 */
export function QuoteApprovedBanner({
  title,
  body,
  linkLabel,
  onPressLink,
}: QuoteApprovedBannerProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable onPress={onPressLink} accessibilityRole="link">
        <Text style={styles.link}>{linkLabel}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  body: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  link: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
    textDecorationLine: 'underline',
  },
})
