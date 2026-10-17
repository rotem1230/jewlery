import { Image, type ImageStyle, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { initialsOf } from '@/src/lib/people'
import { colors } from '@/src/theme/tokens'

type UserAvatarProps = {
  /** The person's photo or business logo; without one their initials are drawn. */
  uri?: string
  /** The name shown next to the avatar (its initials stand in for a missing picture). */
  name: string
  size: number
  style?: StyleProp<ImageStyle>
}

/** A round avatar: the person's own picture, else a neutral circle with their initials. */
export function UserAvatar({ uri, name, size, style }: UserAvatarProps) {
  const box = { width: size, height: size, borderRadius: size / 2 }
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.photo, box, style]}
        resizeMode="cover"
        accessibilityLabel={name}
      />
    )
  }
  return (
    <View style={[styles.initials, box, style as StyleProp<ViewStyle>]} accessible accessibilityLabel={name}>
      <Text style={[styles.letters, { fontSize: Math.round(size * 0.36) }]} numberOfLines={1}>
        {initialsOf(name) || '?'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  photo: {
    backgroundColor: '#E8E8E8',
  },
  initials: {
    backgroundColor: '#D6D4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letters: {
    fontFamily: 'Heebo',
    fontWeight: '600',
    color: colors.brand,
    textAlign: 'center',
  },
})
