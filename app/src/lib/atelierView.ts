import { ApiError, apiErrorCode } from '@/src/lib/api'
import type { AtelierBanner } from '@/src/types/api'

export type ListingExpiry = { date: string; expired: boolean }

/** The end of a listing period as a day ("בתוקף עד …"); null when the listing has no end date. */
export function listingExpiry(
  expiresAt: string | null | undefined,
  locale: 'he' | 'en',
  now: Date = new Date(),
): ListingExpiry | null {
  if (!expiresAt) return null
  const end = new Date(expiresAt)
  if (Number.isNaN(end.getTime())) return null
  return {
    date: end.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB'),
    expired: end.getTime() <= now.getTime(),
  }
}

export type BannerTarget = { kind: 'design' | 'jeweler'; id: string }

export type BannerView = {
  id: string
  headline: string | null
  cta: string | null
  imageUploadId: string | null
  /** Paid placements are always marked as such (PRD), whatever the payload carries. */
  sponsored: true
  target: BannerTarget | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** The banners worth showing: each has a headline or a picture, and always the sponsored tag. */
export function bannerViews(banners: AtelierBanner[] | null | undefined): BannerView[] {
  return (banners ?? []).flatMap((banner) => {
    const headline = text(banner.meta?.headline)
    const imageUploadId = text(banner.meta?.imageUploadId)
    if (!headline && !imageUploadId) return []
    const target: BannerTarget | null =
      banner.entityId && banner.entityType === 'DESIGN'
        ? { kind: 'design', id: banner.entityId }
        : banner.entityId && banner.entityType === 'JEWELER'
          ? { kind: 'jeweler', id: banner.entityId }
          : null
    return [{ id: banner.id, headline, cta: text(banner.meta?.cta), imageUploadId, sponsored: true as const, target }]
  })
}

/** 403 FEATURE_DISABLED: the feature (e.g. "near me" search) is switched off on the server. */
export function isFeatureDisabled(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && apiErrorCode(err) === 'FEATURE_DISABLED'
}

/** 404: e.g. a listing that is no longer live. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}
