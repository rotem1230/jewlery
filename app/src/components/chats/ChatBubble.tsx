import { Image, type ImageSourcePropType, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { Delivery } from '@/src/lib/chatThread'

type ChatBubbleProps = {
  text: string
  time: string
  /** Incoming = jeweler (left/white). Outgoing = designer (right/brand). */
  side: 'incoming' | 'outgoing'
  /** Outgoing only: one grey tick once sent, two blue ticks once the other side read it. */
  delivery?: Delivery
  avatar?: ImageSourcePropType
  avatarLabel?: string
}

const READ_TICK = '#4FC3F7'

const AVATAR = 40
const SIDE_INSET = 16
const AVATAR_GAP = 8

function DoubleCheck({ color }: { color: string }) {
  return (
    <Svg width={14} height={10} viewBox="0 0 14 10" fill="none">
      <Path
        d="M1.2 5.2 L3.4 7.4 L7.8 2.2"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.2 5.2 L7.4 7.4 L12.4 2"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function SingleCheck({ color }: { color: string }) {
  return (
    <Svg width={14} height={10} viewBox="0 0 14 10" fill="none">
      <Path
        d="M3.2 5.2 L5.4 7.4 L10.4 2"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/**
 * Figma chat row — avatar bottom-aligned with bubble;
 * square corner on the avatar side at the bottom of the bubble.
 */
export function ChatBubble({ text, time, side, delivery, avatar, avatarLabel }: ChatBubbleProps) {
  const { t } = useTranslation()
  const outgoing = side === 'outgoing'
  const { width: screenW } = useWindowDimensions()
  const bubbleMaxW = Math.min(screenW * 0.68, screenW - SIDE_INSET * 2 - AVATAR - AVATAR_GAP)

  const avatarNode = avatar ? (
    <Image source={avatar} style={styles.avatar} resizeMode="cover" />
  ) : (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>{avatarLabel ?? 'מ'}</Text>
    </View>
  )

  const meta = (
    <View
      style={[
        styles.meta,
        outgoing ? styles.metaOut : styles.metaIn,
        outgoing ? { marginRight: AVATAR + AVATAR_GAP } : { marginLeft: AVATAR + AVATAR_GAP },
      ]}
    >
      {outgoing && delivery ? (
        <View
          accessible
          accessibilityLabel={t(delivery === 'read' ? 'shChatTickRead' : 'shChatTickSent')}
        >
          {delivery === 'read' ? (
            <DoubleCheck color={READ_TICK} />
          ) : (
            <SingleCheck color={colors.textSecondary} />
          )}
        </View>
      ) : null}
      <Text style={styles.time}>{time}</Text>
    </View>
  )

  return (
    <View style={[styles.outer, outgoing ? styles.outerOut : styles.outerIn]}>
      {/* Avatar + bubble only — bottom-aligned so avatar sits on the bubble’s bottom edge */}
      <View style={styles.cluster}>
        {outgoing ? null : avatarNode}
        <View style={[styles.bubble, outgoing ? styles.bubbleOut : styles.bubbleIn, { maxWidth: bubbleMaxW }]}>
          <Text style={[styles.text, outgoing ? styles.textOut : styles.textIn]}>{text}</Text>
        </View>
        {outgoing ? avatarNode : null}
      </View>
      {meta}
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    flexShrink: 1,
  },
  bubbleIn: {
    backgroundColor: colors.surface,
    // Sharp corner at bottom-left next to avatar
    borderBottomLeftRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleOut: {
    backgroundColor: colors.brand,
    // Sharp corner at bottom-right next to avatar
    borderBottomRightRadius: 0,
  },
  text: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  textIn: {
    color: colors.ink,
  },
  textOut: {
    color: colors.textInverse,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaIn: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-start',
  },
  metaOut: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-end',
  },
  time: {
    fontFamily: 'Heebo',
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
    color: colors.textSecondary,
  },
})
