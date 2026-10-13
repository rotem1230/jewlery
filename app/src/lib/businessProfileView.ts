import type { ImageSourcePropType } from 'react-native'
import { uploadContentUrl } from '@/src/api/uploads'
import { formatTimeAgo } from '@/src/lib/homeUpdates'
import { mediaUrl } from '@/src/lib/media'
import type { JewelerProfile } from '@/src/types/api'

export type BusinessProfileGalleryItem = {
  id: string
  title: string
  image: ImageSourcePropType
}

export type BusinessProfileReviewItem = {
  id: string
  body: string
  author: string
  timeAgo: string
  stars: number
}

export type BusinessProfile = {
  name: string
  about: string
  gallery: BusinessProfileGalleryItem[]
  reviews: BusinessProfileReviewItem[]
}

/** Relative time ("לפני דקה", "אתמול"), the same wording as the home updates. */
export function formatHeTimeAgo(isoDate: string, locale: string): string {
  return formatTimeAgo(isoDate, locale)
}

/**
 * The jeweler's own business profile as shown to them: exactly what they entered (an empty field
 * stays empty, never demo copy or stock artwork). Portfolio pictures use the signed link, else the
 * upload's content route.
 */
export function businessProfileFromRaw(raw: JewelerProfile, locale: string): BusinessProfile {
  return {
    name: raw.businessName ?? '',
    about: raw.bio ?? '',
    gallery: raw.portfolio.map((item) => ({
      id: item.id,
      title: item.title ?? '',
      image: { uri: mediaUrl(item.contentUrl) ?? uploadContentUrl(item.uploadId) },
    })),
    reviews: raw.reviews.map((review) => ({
      id: review.id,
      body: review.comment,
      author: review.reviewerName,
      timeAgo: formatHeTimeAgo(review.createdAt, locale),
      stars: review.rating,
    })),
  }
}
