import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/src/theme/tokens'

export type FilterOption = {
  id: string
  label: string
}

type FilterOptionsSheetProps = {
  visible: boolean
  options: FilterOption[]
  onSelect?: (option: FilterOption) => void
  onRequestClose?: () => void
}

/**
 * Figma וילון אפשרויות פילטור —
 * Compact rows (~56), 16pt vertical padding, dividers between + under last.
 * Layout on inner Views — NativeWind strips Pressable padding.
 */
export function FilterOptionsSheet({
  visible,
  options,
  onSelect,
  onRequestClose,
}: FilterOptionsSheetProps) {
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

const DIVIDER = '#DCDEDF'

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
  list: {
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    width: '100%',
    height: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
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
