import { StyleSheet, View } from 'react-native'
import { Skeleton } from '@/src/components/ui/Skeleton'

/**
 * Loading placeholder for the business-profile screen.
 * Mirrors `BusinessProfileSummary` block-for-block so content swaps in
 * without layout shift.
 */
export function BusinessProfileSkeleton() {
  return (
    <View style={styles.column} testID="business-profile-skeleton">
      <View style={styles.nameRow}>
        <Skeleton width={160} height={24} borderRadius={6} />
      </View>

      <Skeleton height={110} borderRadius={12} />

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Skeleton width={110} height={16} borderRadius={6} />
        </View>
        <View style={styles.galleryGrid}>
          <Skeleton width={156} height={200} borderRadius={12} />
          <Skeleton width={156} height={200} borderRadius={12} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Skeleton width={130} height={16} borderRadius={6} />
        </View>
        <Skeleton height={118} borderRadius={12} />
        <Skeleton height={118} borderRadius={12} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: {
    width: '100%',
    gap: 24,
  },
  nameRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  section: {
    width: '100%',
    gap: 12,
  },
  titleRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  galleryGrid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
})
