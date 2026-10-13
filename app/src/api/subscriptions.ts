/** Subscriptions + CMS content. */
import { ApiError, apiGet, apiPost, buildQuery } from '@/src/lib/api'
import type { ContentPage, PlanCatalog, SubscriptionMe } from '@/src/types/api'
import type { UserRole } from '@/src/constants/roles'

export function listPlans(role?: UserRole, signal?: AbortSignal): Promise<PlanCatalog[]> {
  return apiGet<PlanCatalog[]>(`/subscriptions/plans${buildQuery({ role })}`, { signal })
}

export function getMySubscription(signal?: AbortSignal): Promise<SubscriptionMe | null> {
  return apiGet<SubscriptionMe | null>('/subscriptions/me', { signal })
}

/** The entitlement keys of my live subscription (hd_export, personal_visualization...). */
export async function getMyEntitlements(signal?: AbortSignal): Promise<string[]> {
  const result = await apiGet<{ keys?: unknown }>('/subscriptions/entitlements/me', { signal })
  return Array.isArray(result?.keys) ? result.keys.filter((key): key is string => typeof key === 'string') : []
}

export function subscribeToPlan(planCode: string): Promise<unknown> {
  return apiPost('/subscriptions/subscribe', { planCode })
}

export function cancelSubscription(): Promise<unknown> {
  return apiPost('/subscriptions/cancel', {})
}

export async function getContentPage(
  slug: string,
  locale = 'he',
  signal?: AbortSignal,
): Promise<ContentPage | null> {
  try {
    return await apiGet<ContentPage>(`/content/${slug}${buildQuery({ locale })}`, {
      signal,
      anonymous: true,
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}
