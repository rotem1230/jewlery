import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { RatingStarIcon } from '@/src/components/icons/RatingStarIcon'
import { colors } from '@/src/theme/tokens'

export type JewelerCardCta = 'viewProfile' | 'quoteRequested' | 'ownProfile'

type JewelerCardProps = {
  name: string
  city: string
  rating: string
  reviewCount: number
  reviewsLabel: string
  ctaLabel: string
  ctaVariant: JewelerCardCta
  worksTitle: string
  bio: string
  avatar: ImageSourcePropType
  works: ImageSourcePropType[]
  /** "+N" over the last picture — only with a real count of the further works; nothing otherwise. */
  moreCount?: string
  onPressCta?: () => void
  /** Used only when ctaVariant is 'ownProfile' — the outline "edit" button. */
  editLabel?: string
  onPressEdit?: () => void
  matchScore?: number
  matchLabel?: string
}

/**
 * Figma atelier jeweler card — avatar, rating pill, CTA, portfolio strip, bio.
 */
export function JewelerCard({
  name,
  city,
  rating,
  reviewCount,
  reviewsLabel,
  ctaLabel,
  ctaVariant,
  worksTitle,
  bio,
  avatar,
  works,
  moreCount,
  onPressCta,
  editLabel,
  onPressEdit,
  matchScore,
  matchLabel,
}: JewelerCardProps) {
  const primary = ctaVariant === 'viewProfile' || ctaVariant === 'ownProfile'
  const isOwnProfile = ctaVariant === 'ownProfile'

  return (
    <View style={styles.card}>
      <View style={styles.profile}>
        <View style={styles.avatarRing}>
          <Image source={avatar} style={styles.avatar} resizeMode="cover" />
        </View>

        <Text style={styles.name}>{name}</Text>

        <View style={styles.cityRow}>
          <Text style={styles.city}>{city}</Text>
          <MapPin size={12} color="#454654" strokeWidth={2} />
        </View>

        <View style={styles.ratingPill}>
          <Text style={styles.reviewsLabel}>
            ({reviewCount} {reviewsLabel})
          </Text>
          <Text style={styles.rating}>{rating}</Text>
          <RatingStarIcon />
        </View>
        {typeof matchScore === 'number' && matchScore > 0 ? (
          <Text style={styles.matchScore}>
            {matchLabel ?? 'Match'} {Math.round(matchScore)}
          </Text>
        ) : null}

        {isOwnProfile ? (
          <View style={styles.ownProfileRow}>
            <Pressable
              onPress={onPressEdit}
              style={({ pressed }) => [styles.ctaPressable, styles.flexSlot, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <View style={[styles.cta, styles.ctaOutline]}>
                <Text style={styles.ctaLabelOutline}>{editLabel}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={onPressCta}
              style={({ pressed }) => [styles.ctaPressable, styles.flexSlot, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <View style={[styles.cta, styles.ctaPrimary]}>
                <Text style={styles.ctaLabel}>{ctaLabel}</Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onPressCta}
            style={({ pressed }) => [styles.ctaPressable, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={[styles.cta, primary ? styles.ctaPrimary : styles.ctaMuted]}>
              <Text style={styles.ctaLabel}>{ctaLabel}</Text>
            </View>
          </Pressable>
        )}
      </View>

      <View style={styles.portfolio}>
        <Text style={styles.worksTitle}>{worksTitle}</Text>
        <View style={styles.worksRow}>
          {works.slice(0, 3).map((src, index) => {
            const isLast = index === 2
            return (
              <View key={`${name}-work-${index}`} style={styles.workSlot}>
                <Image source={src} style={styles.workImage} resizeMode="cover" />
                {isLast && moreCount ? (
                  <View style={styles.workOverlay}>
                    <Text style={styles.moreCount}>{moreCount}</Text>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
        <Text style={styles.bio} numberOfLines={2}>
          {bio}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EFECF8',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  profile: {
    width: '100%',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#EFECF8',
    gap: 0,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 0,
    marginBottom: 16,
    shadowColor: '#EFECF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 0,
    borderWidth: 4,
    borderColor: '#EFECF8',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 4,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  city: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: '#454654',
    textAlign: 'center',
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: '#EFECF8',
    borderRadius: 9999,
    marginBottom: 24,
  },
  reviewsLabel: {
    fontFamily: 'Heebo',
    fontSize: 10,
    fontWeight: '400',
    lineHeight: 15,
    color: '#767686',
    writingDirection: 'rtl',
  },
  rating: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    color: colors.ink,
  },
  matchScore: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    color: '#0203A4',
    marginBottom: 16,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.9,
  },
  ctaPressable: {
    alignSelf: 'stretch',
    width: '100%',
  },
  cta: {
    width: '100%',
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  ctaPrimary: {
    backgroundColor: '#0203A4',
  },
  ctaMuted: {
    backgroundColor: '#DBDBDB',
  },
  ctaOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#0203A4',
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: 0.35,
    color: colors.textInverse,
    textAlign: 'center',
  },
  ctaLabelOutline: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: 0.35,
    color: '#0203A4',
    textAlign: 'center',
  },
  ownProfileRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  flexSlot: {
    flex: 1,
  },
  portfolio: {
    width: '100%',
    padding: 24,
    gap: 16,
  },
  worksTitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#767686',
    textAlign: 'right',
  },
  worksRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  workSlot: {
    flex: 1,
    aspectRatio: 89.67 / 94.67,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  workImage: {
    width: '100%',
    height: '100%',
  },
  workOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreCount: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.textInverse,
  },
  bio: {
    width: '100%',
    marginTop: 8,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    fontStyle: 'italic',
    lineHeight: 20,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
