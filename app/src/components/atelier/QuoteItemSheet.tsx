import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/src/theme/tokens'

export type QuoteItemOption = {
  id: string
  label: string
}

type QuoteItemSheetProps = {
  visible: boolean
  title: string
  options: QuoteItemOption[]
  onSelect?: (option: QuoteItemOption) => void
  onRequestClose?: () => void
}

/**
 * Figma quote-item picker — titled bottom sheet with centered rows + dividers.
 */
export function QuoteItemSheet({
  visible,
  title,
  options,
  onSelect,
  onRequestClose,
}: QuoteItemSheetProps) {
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>{title}</Text>

          <View style={styles.list}>
            {options.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => onSelect?.(option)}
                style={({ pressed }) => pressed && styles.pressed}
                accessibilityRole="button"
              >
                <View style={styles.row}>
                  <Text style={styles.label}>{option.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const DIVIDER = '#E8E8E8'

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(27, 27, 35, 0.45)',
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 72,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3C3F44',
  },
  title: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  list: {
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
  },
  label: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
    letterSpacing: -0.16,
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
