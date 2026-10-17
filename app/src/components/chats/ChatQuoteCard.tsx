import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { colors } from '@/src/theme/tokens'

type ChatQuoteCardProps = {
  title: string
  spec: string
  totalLabel: string
  totalValue: string
  materials: string
  labor: string
  delivery: string
  ctaLabel: string
  onPressCta?: () => void
  /** The picture of the design the quote prices (see designPicture). */
  image: ImageSourcePropType
  /** `center` draws a small illustration at its own size (a design without a picture). */
  imageResizeMode?: 'cover' | 'center'
}

/**
 * Figma in-thread quote card — short image strip, compact totals, CTA.
 */
export function ChatQuoteCard({
  title,
  spec,
  totalLabel,
  totalValue,
  materials,
  labor,
  delivery,
  ctaLabel,
  onPressCta,
  image,
  imageResizeMode = 'cover',
}: ChatQuoteCardProps) {
  return (
    <View style={styles.card}>
      <Image source={image} style={styles.image} resizeMode={imageResizeMode} />

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.totalBlock}>
            <Text style={styles.totalLabel}>{totalLabel}</Text>
            <Text style={styles.totalValue}>{totalValue}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.spec} numberOfLines={1}>
              {spec}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>{delivery}</Text>
          <Text style={styles.meta}>{labor}</Text>
          <Text style={styles.meta}>{materials}</Text>
        </View>

        <Pressable
          onPress={onPressCta}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
        >
          <View style={styles.cta}>
            <ChevronLeft size={16} color={colors.textInverse} strokeWidth={2.25} />
            <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  image: {
    width: '100%',
    height: 96,
    backgroundColor: '#1B1B23',
  },
  body: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  spec: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  totalBlock: {
    alignItems: 'flex-start',
    gap: 2,
    paddingTop: 1,
  },
  totalLabel: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 15,
    color: colors.textSecondary,
    textAlign: 'left',
  },
  totalValue: {
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'left',
  },
  metaRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  meta: {
    flexShrink: 1,
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.9,
  },
  cta: {
    width: '100%',
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    color: colors.textInverse,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
