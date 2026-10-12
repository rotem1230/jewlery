import { StyleSheet, Text, View } from 'react-native'
import { GalleryWorkCard } from '@/src/components/atelier/GalleryWorkCard'
import { ReviewCard } from '@/src/components/atelier/ReviewCard'
import { colors } from '@/src/theme/tokens'
import type { GalleryImageItem } from '@/src/components/jeweler/GalleryImagePicker'

type ReviewItem = {
  id: string
  body: string
  author: string
  timeAgo: string
}

type BusinessProfileSummaryProps = {
  name: string
  about: string
  galleryTitle: string
  gallery: Array<GalleryImageItem & { title: string }>
  reviewsTitle: string
  reviews: ReviewItem[]
  reviewsEmptyLabel: string
}

/** Read-only business-profile block, shared by the preview and own-profile-view screens. */
export function BusinessProfileSummary({
  name,
  about,
  galleryTitle,
  gallery,
  reviewsTitle,
  reviews,
  reviewsEmptyLabel,
}: BusinessProfileSummaryProps) {
  return (
    <View style={styles.column}>
      <Text style={styles.name}>{name}</Text>

      <View style={styles.aboutCard}>
        <View style={styles.aboutAccent} />
        <Text style={styles.aboutText}>{about}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{galleryTitle}</Text>
        <View style={styles.galleryGrid}>
          {gallery.map((item) => (
            <GalleryWorkCard key={item.id} image={item.image} title={item.title} width={156} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{reviewsTitle}</Text>
        {reviews.length > 0 ? (
          <View style={styles.reviews}>
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                body={review.body}
                author={review.author}
                timeAgo={review.timeAgo}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyReviews}>{reviewsEmptyLabel}</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: {
    width: '100%',
    gap: 24,
  },
  name: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aboutCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  aboutAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 3,
    backgroundColor: colors.brand,
  },
  aboutText: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  section: {
    width: '100%',
    gap: 12,
  },
  sectionTitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  galleryGrid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  reviews: {
    width: '100%',
    gap: 12,
  },
  emptyReviews: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
