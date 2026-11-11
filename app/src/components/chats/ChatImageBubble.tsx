import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors } from '@/src/theme/tokens'
import { DeliveryTick } from '@/src/components/chats/DeliveryTick'
import type { Delivery } from '@/src/lib/chatThread'

type ChatImageBubbleProps = {
  imageUri: string
  time: string
  side: 'incoming' | 'outgoing'
  /** Outgoing only: sent / read by the other side. */
  delivery?: Delivery
  avatar?: ImageSourcePropType
  avatarLabel?: string
  onPress?: () => void
}

const AVATAR = 40
const SIDE_INSET = 16
const AVATAR_GAP = 8

/** Photo message — same avatar/meta language as ChatBubble. */
export function ChatImageBubble({ imageUri, time, side, delivery, avatar, avatarLabel, onPress }: ChatImageBubbleProps) {
  const outgoing = side === 'outgoing'
  const { width: screenW } = useWindowDimensions()
  const mediaW = Math.min(screenW * 0.62, 260)

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
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="View photo"
          disabled={!onPress}
        >
          <Image
            source={{ uri: imageUri }}
            style={[styles.image, { width: mediaW, height: mediaW * 0.72 }]}
            resizeMode="cover"
          />
        </Pressable>
        {outgoing ? avatarNode : null}
      </View>
      <View
        style={[
          styles.meta,
          outgoing ? { marginRight: AVATAR + AVATAR_GAP } : { marginLeft: AVATAR + AVATAR_GAP },
        ]}
      >
        {outgoing && delivery ? <DeliveryTick delivery={delivery} /> : null}
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
  image: {
    borderRadius: 18,
    backgroundColor: '#E8E8E8',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  time: {
    fontFamily: 'Heebo',
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
    color: colors.textSecondary,
  },
})
