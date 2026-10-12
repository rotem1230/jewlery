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
