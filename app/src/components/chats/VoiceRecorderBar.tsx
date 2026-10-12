import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Send, Trash2 } from 'lucide-react-native'
import { colors } from '@/src/theme/tokens'
import { formatVoiceDuration } from '@/src/lib/voiceNotes'

type VoiceRecorderBarProps = {
  elapsedMs: number
  sending?: boolean
  onCancel: () => void
  onSend: () => void
}

/** Replaces the composer while recording: discard · timer · send. */
export function VoiceRecorderBar({ elapsedMs, sending, onCancel, onSend }: VoiceRecorderBarProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onCancel}
          disabled={sending}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel="Discard recording"
        >
          <View style={styles.discardBtn}>
            <Trash2 size={18} color={colors.ink} strokeWidth={2} />
          </View>
        </Pressable>

        <View style={styles.status}>
          <View style={styles.dot} />
          <Text style={styles.timer}>{formatVoiceDuration(elapsedMs)}</Text>
        </View>

        <Pressable
          onPress={onSend}
          disabled={sending}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel="Send voice message"
        >
          <View style={[styles.sendBtn, sending && styles.sendDisabled]}>
            <Send size={18} color={colors.textInverse} strokeWidth={2} />
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
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  discardBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: '#EEF1F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D64545',
  },
  timer: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.6,
  },
})
