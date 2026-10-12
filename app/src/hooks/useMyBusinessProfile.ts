import { useCallback, useMemo } from 'react'
import type { ImageSourcePropType } from 'react-native'
import { getMyBusinessProfile } from '@/src/api/jewelerProfiles'
import { uploadContentUrl } from '@/src/api/uploads'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation } from '@/src/i18n'
import heroRing from '../../assets/images/home/hero-ring.png'
import galleryCollection from '../../assets/images/home/gallery-collection.png'

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

/**
 * Gallery artwork resolution: backend bytes first (`GET /uploads/:id/content`),
 * bundled art as offline fallback keyed by title.
 */
const FALLBACK_ARTWORK: Record<string, ImageSourcePropType> = {
  'טבעת אוקיינוס': heroRing,
  'עגילי פרח': galleryCollection,
}

const FALLBACK_CYCLE = [galleryCollection, heroRing]

function resolveArtwork(
  title: string | null,
  uploadId: string | undefined,
  remoteUrl: string | null | undefined,
  index: number,
): ImageSourcePropType {
  if (uploadId) return { uri: uploadContentUrl(uploadId) }
  if (remoteUrl) return { uri: remoteUrl }
  if (title && FALLBACK_ARTWORK[title]) return FALLBACK_ARTWORK[title]
  return FALLBACK_CYCLE[index % FALLBACK_CYCLE.length]
}

/** Minimal Hebrew relative-time formatter (matches the seeded review ages). */
export function formatHeTimeAgo(isoDate: string, locale: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))
  if (locale !== 'he') {
    if (minutes < 60) return 'Just now'
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return days === 1 ? 'Yesterday' : `${days} days ago`
  }
  if (minutes < 1) return 'עכשיו'
  if (minutes < 60) return `לפני ${minutes} דקות`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'אתמול'
  if (days === 2) return 'לפני יומיים'
  if (days < 7) return `לפני ${days} ימים`
  if (days < 14) return 'לפני שבוע'
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`
  return `לפני ${Math.floor(days / 30)} חודשים`
}

/**
 * Page 1 data hook: own jeweler business profile.
 * Falls back to the previous demo copy field-by-field so the screen never
 * renders blank when the backend profile is missing/unpublished.
 */
export function useMyBusinessProfile() {
  const { t, locale } = useTranslation()
  // Reload when the session token changes (e.g. dev login replacing demo).
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const loadProfile = useCallback((signal: AbortSignal) => getMyBusinessProfile(signal), [])
  const query = useAsyncData(loadProfile, { deps: [accessToken] })

  const profile = useMemo<BusinessProfile | null>(() => {
    const raw = query.data
    if (!raw) return null
    return {
      name: raw.businessName || t('businessProfileDemoName'),
      about: raw.bio || t('businessProfileDemoAbout'),
      gallery: raw.portfolio.map((item, index) => ({
        id: item.id,
        title: item.title || t('businessProfileWork1Title'),
        image: resolveArtwork(item.title, item.uploadId, item.upload?.url, index),
      })),
      reviews: raw.reviews.map((review) => ({
        id: review.id,
        body: review.comment,
        author: review.reviewerName,
        timeAgo: formatHeTimeAgo(review.createdAt, locale),
        stars: review.rating,
      })),
    }
  }, [query.data, t, locale])

  return { ...query, profile }
}
