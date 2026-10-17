import { StyleSheet, Text, View } from 'react-native'
import { UserAvatar } from '@/src/components/ui/UserAvatar'
import { colors } from '@/src/theme/tokens'
import { PressableBox } from '@/src/components/ui/PressableBox'

type ChatRowProps = {
  name: string
  design: string
  preview: string
  time: string
  unread?: number
  /** The other side's photo or business logo; without one their initials are shown. */
  avatarUri?: string
  onPress?: () => void
  showDivider?: boolean
}

const PAD_X = 24
const META_W = 40
const AVATAR = 56
const GAP = 12

/**
 * Figma chat row — time/badge left, RTL copy middle, 56 avatar right.
 * Uses absolute side slots so layout cannot collapse to a column.
 */
export function ChatRow({
  name,
  design,
  preview,
  time,
  unread,
  avatarUri,
  onPress,
  showDivider = true,
}: ChatRowProps) {
  return (
    <PressableBox
      onPress={onPress}
      style={[styles.pressable]} pressedStyle={styles.pressed}
    >
      <View style={[styles.row, showDivider && styles.divider]}>
        <View style={styles.meta} pointerEvents="none">
          <Text style={styles.time}>{time}</Text>
          {unread != null && unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread}</Text>
            </View>
          ) : (
            <View style={styles.badgeSpacer} />
          )}
        </View>

        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.design} numberOfLines={1}>
            {design}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        </View>

        <View style={styles.avatarSlot} pointerEvents="none">
          <UserAvatar uri={avatarUri} name={name} size={AVATAR} />
        </View>
      </View>
    </PressableBox>
  )
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  pressed: {
    opacity: 0.92,
  },
  row: {
    width: '100%',
    minHeight: 84,
    position: 'relative',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: PAD_X,
    backgroundColor: colors.surface,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  meta: {
    position: 'absolute',
    left: PAD_X,
    top: 0,
    bottom: 0,
    width: META_W,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  time: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSpacer: {
    width: 22,
    height: 22,
  },
  badgeText: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 14,
    color: colors.textInverse,
    textAlign: 'center',
  },
  copy: {
    width: '100%',
    paddingLeft: META_W + GAP,
    paddingRight: AVATAR + GAP,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  name: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  design: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  preview: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  avatarSlot: {
    position: 'absolute',
    right: PAD_X,
    top: 0,
    bottom: 0,
    width: AVATAR,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
