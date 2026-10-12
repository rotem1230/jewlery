/** In-app notifications for the signed-in user. */
import { apiGet, apiPost, buildQuery } from '@/src/lib/api'
import type { AppNotification, Paginated } from '@/src/types/api'

export type NotificationPage = Paginated<AppNotification> & { unreadCount: number }

export function listNotifications(
  params?: { page?: number; unreadOnly?: boolean },
  signal?: AbortSignal,
): Promise<NotificationPage> {
  return apiGet<NotificationPage>(`/notifications${buildQuery(params ?? {})}`, { signal })
}

export function markNotificationRead(id: string): Promise<AppNotification> {
  return apiPost<AppNotification>(`/notifications/${id}/read`, {})
}
