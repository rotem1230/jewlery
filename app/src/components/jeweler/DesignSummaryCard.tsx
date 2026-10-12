import { Image, type ImageSourcePropType, Platform, StyleSheet, Text, View } from 'react-native'
import { Gem } from 'lucide-react-native'
import { SpecGrid } from '@/src/components/designs/SpecGrid'
import type { DesignSpec } from '@/src/components/designs/DesignDetailsCard'
import { colors, radii } from '@/src/theme/tokens'

type DesignSummaryCardProps = {
  sectionTitle: string
  image: ImageSourcePropType
  title: string
  quote: string
  specs: DesignSpec[]
}

/**
 * Jeweler-facing design summary — like DesignDetailsCard but the photo sits
 * inset with padding instead of bleeding to the card's outer corners.
 */
export function DesignSummaryCard({
  sectionTitle,
  image,
  title,
  quote,
  specs,
}: DesignSummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        <Gem size={20} color={colors.brand} strokeWidth={1.75} />
      </View>

      <View style={styles.mediaWrap}>
        <Image source={image} style={styles.image} resizeMode="cover" />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.quote}>{quote}</Text>
      </View>

      <SpecGrid items={specs} />
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
