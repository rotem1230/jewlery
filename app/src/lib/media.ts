import { API_BASE_URL } from '@/src/config/env'

/**
 * Absolute URL for a media link returned by the API. Private media (chat images, voice notes,
 * drafts, generated models) is only served through these short-lived signed links, so screens use
 * them as given instead of building URLs from upload ids.
 */
export function mediaUrl(link: string | null | undefined): string | undefined {
  if (!link) return undefined
  if (/^https?:\/\//.test(link)) return link
  return `${API_BASE_URL}${link.startsWith('/') ? link : `/${link}`}`
}

/**
 * The first of `links` (freshest first) that serves this upload: a link kept from earlier may
 * point at a file that was replaced since, or be about to expire.
 */
export function linkForUpload(
  uploadId: string | null | undefined,
  ...links: Array<string | null | undefined>
): string | undefined {
  if (!uploadId) return undefined
  return links.find((link): link is string => Boolean(link?.includes(`/uploads/${uploadId}/content`)))
}

const REFRESH_BEFORE_EXPIRY_MS = 60_000
const MIN_REFRESH_DELAY_MS = 5_000

/**
 * Milliseconds until the screen should fetch fresh signed links: a minute before the first of
 * them expires (`exp`, in seconds), at least a few seconds from now; null without signed links.
 */
export function nextLinkRefreshDelay(links: Array<string | null | undefined>, nowMs: number = Date.now()): number | null {
  let firstExpiry: number | null = null
  for (const link of links) {
    const exp = link ? /[?&]exp=(\d+)/.exec(link)?.[1] : undefined
    if (exp) firstExpiry = Math.min(firstExpiry ?? Infinity, Number(exp) * 1000)
  }
  if (firstExpiry === null) return null
  return Math.max(firstExpiry - REFRESH_BEFORE_EXPIRY_MS - nowMs, MIN_REFRESH_DELAY_MS)
}
