/**
 * Paid / gated studio features (PRD 5.8, 5.10). Try-on is checked BEFORE the designer picks or
 * uploads a personal photo: the feature flag first (as the server does), then the entitlement.
 */
import { ApiError, apiErrorCode } from '@/src/lib/api'

export const TRY_ON_FLAG = 'phase2_visualization'
export const TRY_ON_ENTITLEMENT = 'personal_visualization'

export type TryOnGate = 'available' | 'coming_soon' | 'paywall'

/**
 * `flags` is the signed-in user's evaluated flags (`GET /feature-flags`), or null when they could
 * not be read; then only the entitlement gates it and the server's FEATURE_DISABLED still applies.
 */
export function tryOnGate(flags: Record<string, boolean> | null, entitlementKeys: string[]): TryOnGate {
  if (flags && flags[TRY_ON_FLAG] !== true) return 'coming_soon'
  return entitlementKeys.includes(TRY_ON_ENTITLEMENT) ? 'available' : 'paywall'
}

export type JobRefusal = 'coming_soon' | 'paywall' | 'quota' | 'failed'

/** What a refused try-on / export job means for the designer. */
export function jobRefusal(err: unknown): JobRefusal {
  const code = apiErrorCode(err)
  if (code === 'FEATURE_DISABLED') return 'coming_soon'
  if (code === 'PAYWALL') return 'paywall'
  if ((code && code.endsWith('_QUOTA_EXCEEDED')) || (err instanceof ApiError && err.status === 429)) return 'quota'
  return 'failed'
}

/**
 * Starts a try-on with the personal photo just uploaded. If the job is refused (limit, paywall,
 * feature off), the photo is deleted: nothing will use it (PRD 7.2). The refusal is rethrown so the
 * designer is told why; a failed delete does not hide it (the photo then goes with the account).
 */
export async function withPhotoRemovedOnRefusal<J>(
  uploadId: string,
  start: () => Promise<J>,
  remove: (uploadId: string) => Promise<unknown>,
): Promise<J> {
  try {
    return await start()
  } catch (err) {
    await remove(uploadId).catch(() => undefined)
    throw err
  }
}
