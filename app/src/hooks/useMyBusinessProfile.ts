import { useCallback, useMemo } from 'react'
import { getMyBusinessProfile } from '@/src/api/jewelerProfiles'
import { businessProfileFromRaw, type BusinessProfile } from '@/src/lib/businessProfileView'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation } from '@/src/i18n'

export {
  formatHeTimeAgo,
  type BusinessProfile,
  type BusinessProfileGalleryItem,
  type BusinessProfileReviewItem,
} from '@/src/lib/businessProfileView'

/** Page 1 data hook: own jeweler business profile, exactly as entered. */
export function useMyBusinessProfile() {
  const { locale } = useTranslation()
  // Reload when the session token changes (e.g. dev login replacing demo).
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const loadProfile = useCallback((signal: AbortSignal) => getMyBusinessProfile(signal), [])
  const query = useAsyncData(loadProfile, { deps: [accessToken] })

  const profile = useMemo<BusinessProfile | null>(
    () => (query.data ? businessProfileFromRaw(query.data, locale) : null),
    [query.data, locale],
  )

  return { ...query, profile }
}
