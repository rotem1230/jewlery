import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { colors, radii, spacing } from '@/src/theme/tokens'

type QuoteRequestSuccessModalProps = {
  visible: boolean
  title: string
  message: string
  ctaLabel: string
  onCta?: () => void
  onRequestClose?: () => void
}

/**
 * Figma quote-request success — green check, copy, back-to-atelier CTA.
 */
export function QuoteRequestSuccessModal({
  visible,
  title,
  message,
  ctaLabel,
  onCta,
  onRequestClose,
}: QuoteRequestSuccessModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Check size={28} color="#16A34A" strokeWidth={2.75} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <Pressable
            onPress={onCta}
            style={({ pressed }) => [styles.ctaPressable, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={styles.cta}>
              <Text style={styles.ctaLabel}>{ctaLabel}</Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27, 27, 35, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.page,
  },
  card: {
    width: '100%',
    maxWidth: 343,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  message: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: spacing.xs,
  },
  pressed: {
    opacity: 0.9,
  },
  ctaPressable: {
    width: '100%',
  },
  cta: {
    width: '100%',
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textInverse,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
