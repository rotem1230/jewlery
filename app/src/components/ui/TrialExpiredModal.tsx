import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { colors, radii, spacing } from '@/src/theme/tokens'

type TrialExpiredModalProps = {
  visible: boolean
  title: string
  message: string
  primaryLabel: string
  onPrimary?: () => void
  onRequestClose?: () => void
}

/**
 * Figma pricing/designers — trial-ended paywall dialog, warning icon + single CTA.
 */
export function TrialExpiredModal({
  visible,
  title,
  message,
  primaryLabel,
  onPrimary,
  onRequestClose,
}: TrialExpiredModalProps) {
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
            <AlertTriangle size={28} color="#D97706" strokeWidth={2} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <BrandButton label={primaryLabel} variant="primary" flex={false} onPress={onPrimary} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.page,
  },
  card: {
    width: '100%',
    maxWidth: 343,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
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
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.22,
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
    letterSpacing: -0.15,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: spacing.xs,
  },
})
