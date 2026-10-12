/** Role-aware home summary (greeting, counts, recent items). */
import { apiGet } from '@/src/lib/api'
import type { HomeSummary } from '@/src/types/api'

export function getHomeSummary(signal?: AbortSignal): Promise<HomeSummary> {
  return apiGet<HomeSummary>('/home/summary', { signal })
}
