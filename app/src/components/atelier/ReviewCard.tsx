import { StyleSheet, Text, View } from 'react-native'
import { RatingStarIcon } from '@/src/components/icons/RatingStarIcon'
import { colors } from '@/src/theme/tokens'

type ReviewCardProps = {
  body: string
  author: string
  timeAgo: string
  stars?: number
}

/** Figma customer recommendation card — stars RTL-right, time left, quote, name. */
export function ReviewCard({ body, author, timeAgo, stars = 5 }: ReviewCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.time}>{timeAgo}</Text>
        <View style={styles.stars}>
          {Array.from({ length: stars }).map((_, index) => (
            <RatingStarIcon key={`star-${index}`} width={12} height={11} color={colors.brand} />
          ))}
        </View>
      </View>

      <Text style={styles.body}>{body}</Text>
      <Text style={styles.author}>— {author}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: '#767686',
    writingDirection: 'rtl',
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  body: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  author: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
