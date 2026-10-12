import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image as ImageIcon, Mic, Plus, Send } from 'lucide-react-native'
import { colors } from '@/src/theme/tokens'

type ChatComposerProps = {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  onSend?: () => void
  onAttach?: () => void
  onMicPress?: () => void
  onGalleryPress?: () => void
}

/**
 * Figma chat composer — send · pill (mic | gallery | input) · plus.
 */
export function ChatComposer({
  value,
  onChangeText,
  placeholder,
  onSend,
  onAttach,
  onMicPress,
  onGalleryPress,
}: ChatComposerProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onSend}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <View style={styles.sendBtn}>
            <Send size={18} color={colors.textInverse} strokeWidth={2} />
          </View>
        </Pressable>

        <View style={styles.field}>
          <View style={styles.fieldIcons}>
            <Pressable onPress={onMicPress} hitSlop={8} accessibilityRole="button">
              <Mic size={18} color={colors.textSecondary} strokeWidth={1.75} />
            </Pressable>
            <Pressable onPress={onGalleryPress} hitSlop={8} accessibilityRole="button">
              <ImageIcon size={18} color={colors.textSecondary} strokeWidth={1.75} />
            </Pressable>
          </View>
          <View style={styles.fieldDivider} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            textAlign="right"
            multiline
          />
        </View>

        <Pressable
          onPress={onAttach}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel="Attach"
        >
          <View style={styles.plusBtn}>
            <Plus size={22} color={colors.ink} strokeWidth={1.75} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: '#EEF1F4',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 8,
    gap: 8,
  },
  fieldIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fieldDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#D6D9DB',
  },
  input: {
    flex: 1,
    minHeight: 24,
    paddingVertical: 0,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: colors.ink,
    writingDirection: 'rtl',
  },
})
