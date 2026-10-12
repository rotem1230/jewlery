import {
  Image,
  type ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, radii } from '@/src/theme/tokens'

type QuoteOfferCardProps = {
  name: string
  role: string
  priceValue: string
  deliveryValue: string
  priceLabel: string
  deliveryLabel: string
  chatLabel: string
  avatar?: ImageSourcePropType
  avatarColor?: string
  onChat?: () => void
}

const androidFont = Platform.OS === 'android' ? { includeFontPadding: false as const } : null

/** Optically centered chevron — lucide viewBox leaves empty space on one side. */
function ChatChevron() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" accessibilityElementsHidden>
      <Path
        d="M8 1.5L3.5 6L8 10.5"
        stroke={colors.textInverse}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

/**
 * Figma ZOREF quote card — chat CTA left, avatar+copy right, light shadow.
 */
export function QuoteOfferCard({
  name,
  role,
  priceLabel,
  priceValue,
  deliveryLabel,
  deliveryValue,
  chatLabel,
  avatar,
  avatarColor = '#C4B5A5',
  onChat,
}: QuoteOfferCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable
          onPress={onChat}
          accessibilityRole="button"
          style={({ pressed }) => [styles.chatPressable, pressed && styles.pressed]}
        >
          <View style={styles.chatBtn}>
            <ChatChevron />
            <Text style={styles.chatLabel} numberOfLines={1}>
              {chatLabel}
            </Text>
          </View>
        </Pressable>

        <View style={styles.copy}>
          <View style={styles.identity}>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.role}>{role}</Text>
            </View>
            {avatar ? (
              <Image source={avatar} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColor }]} />
            )}
          </View>

          <View style={styles.meta}>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>{priceLabel} </Text>
              <Text style={styles.metaValue}>{priceValue}</Text>
            </Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>{deliveryLabel} </Text>
              <Text style={styles.metaValue}>{deliveryValue}</Text>
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 16,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  pressed: {
    opacity: 0.9,
  },
  chatPressable: {
    alignSelf: 'flex-start',
  },
  chatBtn: {
    height: 32,
    minWidth: 78,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    shadowColor: '#0A0D12',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chatLabel: {
    ...androidFont,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    // Match button height so glyphs sit on the vertical midpoint
    lineHeight: 32,
    height: 32,
    letterSpacing: -0.16,
    color: colors.textInverse,
    textAlign: 'center',
    textAlignVertical: 'center',
    ...(Platform.OS === 'ios' ? { paddingTop: 1 } : null),
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 108,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  nameBlock: {
    alignItems: 'flex-end',
    gap: 4,
  },
  name: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: colors.updateTitle,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  role: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E8E8E8',
  },
  meta: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 4,
  },
  metaLine: {
    width: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metaLabel: {
    ...androidFont,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.updateTitle,
  },
  metaValue: {
    ...androidFont,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.updateTitle,
  },
})
