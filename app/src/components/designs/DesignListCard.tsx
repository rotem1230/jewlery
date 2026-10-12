import { Image, type ImageSourcePropType, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii } from '@/src/theme/tokens'

export type DesignBadgeTone = 'muted' | 'ink' | 'brand' | 'success' | 'outline'

type DesignListCardProps = {
  title: string
  subtitle: string
  /** Optional second subtitle line (e.g. completed-by) */
  detail?: string
  statusLabel: string
  statusTone?: DesignBadgeTone
  accentLabel?: string
  accentTone?: DesignBadgeTone
  image: ImageSourcePropType
  onPress?: () => void
}

const TONE_BG: Record<DesignBadgeTone, string> = {
  muted: '#F1F5F9',
  ink: colors.ink,
  brand: colors.brand,
  success: '#DCFCE7',
  outline: colors.surface,
}

const TONE_FG: Record<DesignBadgeTone, string> = {
  muted: colors.ink,
  ink: colors.textInverse,
  brand: colors.textInverse,
  success: '#166534',
  outline: colors.ink,
}

const TONE_BORDER: Record<DesignBadgeTone, string | null> = {
  muted: null,
  ink: null,
  brand: null,
  success: null,
  outline: colors.borderSubtleLight,
}

function Pill({
  label,
  tone,
}: {
  label: string
  tone: DesignBadgeTone
}) {
  const border = TONE_BORDER[tone]
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: TONE_BG[tone] },
        border ? { borderWidth: 1, borderColor: border } : null,
      ]}
    >
      <Text style={[styles.pillText, { color: TONE_FG[tone] }]}>{`\u2066${label}\u2069`}</Text>
    </View>
  )
}

/**
 * Figma design list card — draft / published / done badge variants.
 */
export function DesignListCard({
  title,
  subtitle,
  detail,
  statusLabel,
  statusTone = 'muted',
  accentLabel,
  accentTone = 'brand',
  image,
  onPress,
}: DesignListCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Image source={image} style={styles.thumb} resizeMode="cover" />
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <View style={styles.meta}>
              <View style={styles.subcopy}>
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
                {detail ? (
                  <Text style={styles.detail} numberOfLines={2}>
                    {detail}
                  </Text>
                ) : null}
              </View>
              <View style={styles.badges}>
                {accentLabel ? <Pill label={accentLabel} tone={accentTone} /> : null}
                <Pill label={statusLabel} tone={statusTone} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  )
}

const androidFont = Platform.OS === 'android' ? { includeFontPadding: false as const } : null

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  thumb: {
    width: 108,
    height: 108,
    borderRadius: radii.md,
    backgroundColor: '#0F3D3E',
  },
  copy: {
    flex: 1,
    minHeight: 108,
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 16,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: colors.updateTitle,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  meta: {
    width: '100%',
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  subcopy: {
    width: '100%',
    gap: 2,
    alignItems: 'flex-end',
  },
  subtitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detail: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 18,
    letterSpacing: -0.14,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 4,
  },
  pill: {
    height: 17,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    ...androidFont,
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 12,
    letterSpacing: -0.12,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null),
  },
})
