import { Image, type ImageSourcePropType, Platform, StyleSheet, Text, View } from 'react-native'
import { Gem } from 'lucide-react-native'
import { SpecGrid } from '@/src/components/designs/SpecGrid'
import type { DesignSpec } from '@/src/components/designs/DesignDetailsCard'
import { colors, radii } from '@/src/theme/tokens'

type DesignSummaryCardProps = {
  sectionTitle: string
  image: ImageSourcePropType
  /** `center` draws a small illustration at its own size (a design without a picture). */
  imageResizeMode?: 'cover' | 'center'
  title: string
  quote: string
  specs: DesignSpec[]
  /** Short lines under the title, e.g. the listing period ("בתוקף עד …"). */
  details?: string[]
  /** The inspiration picture of the brief (PRD 5.4), when the designer added one. */
  inspiration?: { title: string; uri: string }
}

/**
 * Jeweler-facing design summary — like DesignDetailsCard but the photo sits
 * inset with padding instead of bleeding to the card's outer corners.
 */
export function DesignSummaryCard({
  sectionTitle,
  image,
  imageResizeMode = 'cover',
  title,
  quote,
  specs,
  details,
  inspiration,
}: DesignSummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        <Gem size={20} color={colors.brand} strokeWidth={1.75} />
      </View>

      <View style={styles.mediaWrap}>
        <Image source={image} style={styles.image} resizeMode={imageResizeMode} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {details?.map((line) => (
          <Text key={line} style={styles.detail}>
            {line}
          </Text>
        ))}
        {quote ? <Text style={styles.quote}>{quote}</Text> : null}
      </View>

      <SpecGrid items={specs} />

      {inspiration ? (
        <View style={styles.inspiration}>
          <Text style={styles.inspirationTitle}>{inspiration.title}</Text>
          <View style={styles.inspirationWrap}>
            <Image
              source={{ uri: inspiration.uri }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel={inspiration.title}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    gap: 16,
  },
  cardHeader: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mediaWrap: {
    width: '100%',
    aspectRatio: 311 / 260,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  inspiration: {
    width: '100%',
    gap: 8,
  },
  inspirationTitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inspirationWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  copy: {
    width: '100%',
    gap: 4,
    alignItems: 'flex-end',
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detail: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  quote: {
    width: '100%',
    fontFamily: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'System' }),
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
