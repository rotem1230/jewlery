import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Check, ChevronLeft } from 'lucide-react-native'
import { colors, radii, spacing } from '@/src/theme/tokens'

type QuoteApproveSuccessModalProps = {
  visible: boolean
  title: string
  message: string
  detail: string
  ctaLabel: string
  onCta?: () => void
  onRequestClose?: () => void
}

/**
 * Figma quote-approve success — green check, "!מעולה", copy, chat CTA with chevron.
 */
export function QuoteApproveSuccessModal({
  visible,
  title,
  message,
  detail,
  ctaLabel,
  onCta,
  onRequestClose,
}: QuoteApproveSuccessModalProps) {
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
          <Text style={styles.detail}>{detail}</Text>

          <Pressable
            onPress={onCta}
            style={({ pressed }) => [styles.ctaPressable, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={styles.cta}>
              <ChevronLeft size={16} color={colors.textInverse} strokeWidth={2.25} />
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
    borderRadius: 16,
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
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
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
  },
  detail: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    color: colors.textInverse,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
