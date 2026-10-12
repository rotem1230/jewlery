import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Pause, Play } from 'lucide-react-native'
import { colors } from '@/src/theme/tokens'
import { formatVoiceDuration } from '@/src/lib/voiceNotes'

type ChatAudioBubbleProps = {
  time: string
  side: 'incoming' | 'outgoing'
  playing: boolean
  /** Elapsed/total while this note plays; total 0 until first playback. */
  positionMs?: number
  durationMs?: number
  onTogglePlay: () => void
  avatar?: ImageSourcePropType
  avatarLabel?: string
}

const AVATAR = 40
const SIDE_INSET = 16
const AVATAR_GAP = 8
const BARS = 18

/** Voice-note message — play/pause + progress bars + time meta. */
export function ChatAudioBubble({
  time,
  side,
  playing,
  positionMs = 0,
  durationMs = 0,
  onTogglePlay,
  avatar,
  avatarLabel,
}: ChatAudioBubbleProps) {
  const outgoing = side === 'outgoing'
  const { width: screenW } = useWindowDimensions()
  const bubbleW = Math.min(screenW * 0.62, 240)
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0
  const label =
    durationMs > 0 ? formatVoiceDuration(positionMs) + ' / ' + formatVoiceDuration(durationMs) : time

  const avatarNode = avatar ? (
    <Image source={avatar} style={styles.avatar} resizeMode="cover" />
  ) : (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>{avatarLabel ?? 'מ'}</Text>
    </View>
  )

  return (
    <View style={[styles.outer, outgoing ? styles.outerOut : styles.outerIn]}>
      <View style={styles.cluster}>
        {outgoing ? null : avatarNode}
        <View
          style={[
            styles.bubble,
            outgoing ? styles.bubbleOut : styles.bubbleIn,
            { width: bubbleW },
          ]}
        >
          <Pressable
            onPress={onTogglePlay}
            style={styles.playBtn}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            hitSlop={6}
          >
            {playing ? (
              <Pause size={18} color={outgoing ? colors.textInverse : colors.brand} strokeWidth={2} />
            ) : (
              <Play size={18} color={outgoing ? colors.textInverse : colors.brand} strokeWidth={2} />
            )}
          </Pressable>
          <View style={styles.track}>
            <View style={styles.bars}>
              {Array.from({ length: BARS }).map((_, index) => {
                const active = index / BARS <= progress
                return (
                  <View
                    key={`bar-${index}`}
                    style={[
                      styles.bar,
                      {
                        height: 6 + ((index * 7) % 12),
                        backgroundColor: active
                          ? outgoing
                            ? colors.textInverse
                            : colors.brand
                          : outgoing
                            ? 'rgba(255,255,255,0.45)'
                            : '#C9CDD3',
                      },
                    ]}
                  />
                )
              })}
            </View>
            <Text style={[styles.duration, outgoing ? styles.durationOut : styles.durationIn]}>
              {label}
            </Text>
          </View>
        </View>
        {outgoing ? avatarNode : null}
      </View>
      <View
        style={[
          styles.meta,
          outgoing ? { marginRight: AVATAR + AVATAR_GAP } : { marginLeft: AVATAR + AVATAR_GAP },
        ]}
      >
        <Text style={styles.time}>{time}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    paddingHorizontal: SIDE_INSET,
    gap: 4,
  },
  outerIn: {
    alignItems: 'flex-start',
  },
  outerOut: {
    alignItems: 'flex-end',
  },
  cluster: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: AVATAR_GAP,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: '#E8E8E8',
  },
  avatarFallback: {
    backgroundColor: '#D6D4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '600',
    color: colors.brand,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bubbleIn: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleOut: {
    backgroundColor: colors.brand,
    borderBottomRightRadius: 0,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,150,0.16)',
  },
  track: {
    flex: 1,
    gap: 4,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
  duration: {
    fontFamily: 'Heebo',
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
  },
  durationIn: {
    color: colors.textSecondary,
  },
  durationOut: {
    color: colors.textInverse,
    opacity: 0.9,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
    fontFamily: 'Heebo',
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
    color: colors.textSecondary,
  },
})
