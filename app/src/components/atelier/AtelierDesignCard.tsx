import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { colors, radii } from '@/src/theme/tokens'
import { PressableBox } from '@/src/components/ui/PressableBox'

type AtelierDesignCardProps = {
  title: string
  metal: string
  publishedLabel: string
  /** The listing period, e.g. "בתוקף עד 20.11.2026"; omitted when the listing has no end date. */
  expiryLabel?: string
  ctaLabel: string
  image: ImageSourcePropType
  /** `center` draws a small illustration at its own size (a design without a picture). */
  imageResizeMode?: 'cover' | 'center'
  onPress?: () => void
  sponsored?: boolean
  sponsoredLabel?: string
}

/**
 * Figma אטליה עיצובים list card — thumb left, RTL copy + brand CTA.
 */
export function AtelierDesignCard({
  title,
  metal,
  publishedLabel,
  expiryLabel,
  ctaLabel,
  image,
  imageResizeMode = 'cover',
  onPress,
  sponsored,
  sponsoredLabel,
}: AtelierDesignCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Image source={image} style={styles.thumb} resizeMode={imageResizeMode} />

        <View style={styles.copy}>
          {sponsored ? (
            <Text style={styles.sponsored}>{sponsoredLabel ?? 'Sponsored'}</Text>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.metal} numberOfLines={1}>
            {metal}
          </Text>
          <Text style={styles.published} numberOfLines={1}>
            {publishedLabel}
          </Text>
          {expiryLabel ? (
            <Text style={styles.published} numberOfLines={1}>
              {expiryLabel}
            </Text>
          ) : null}

          <PressableBox
            onPress={onPress}
            style={[styles.ctaPressable]} pressedStyle={styles.pressed}
            accessibilityRole="button"
          >
            <View style={styles.cta}>
              <ChevronLeft size={14} color={colors.textInverse} strokeWidth={2.25} />
              <Text style={styles.ctaLabel}>{ctaLabel}</Text>
            </View>
          </PressableBox>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  thumb: {
    width: 112,
    height: 112,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  copy: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sponsored: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#0203A4',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metal: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  published: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: '#767686',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.9,
  },
  ctaPressable: {
    marginTop: 4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
    color: colors.textInverse,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
