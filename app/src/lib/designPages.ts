/**
 * "My designs" pages: every design of a tab is reachable by loading the next page on scroll.
 * Each state belongs to one tab (`key`), so a page that arrives after the tab changed is ignored.
 */
import type { DesignListItem, DesignListResponse, DesignTabCounts } from '@/src/types/api'

export type DesignPages = {
  key: string
  items: DesignListItem[]
  page: number
  totalPages: number
  tabCounts: DesignTabCounts
}

export function firstDesignPage(key: string, response: DesignListResponse): DesignPages {
  return {
    key,
    items: response.items,
    page: response.pagination.page,
    totalPages: response.pagination.totalPages,
    tabCounts: response.tabCounts,
  }
}

/** The next page appended; a design already listed (it moved up a page meanwhile) is not repeated. */
export function appendDesignPage(state: DesignPages, key: string, response: DesignListResponse): DesignPages {
  if (key !== state.key || response.pagination.page !== state.page + 1) return state
  const seen = new Set(state.items.map((item) => item.id))
  return {
    key,
    items: [...state.items, ...response.items.filter((item) => !seen.has(item.id))],
    page: response.pagination.page,
    totalPages: response.pagination.totalPages,
    tabCounts: response.tabCounts,
  }
}

export function canLoadMoreDesigns(state: DesignPages | null | undefined): boolean {
  return Boolean(state && state.page < state.totalPages)
}

type ScrollMetrics = {
  layoutMeasurement: { height: number }
  contentOffset: { y: number }
  contentSize: { height: number }
}

/** Within `threshold` points of the bottom of the scrolled content. */
export function isNearListEnd(metrics: ScrollMetrics, threshold = 200): boolean {
  return metrics.layoutMeasurement.height + metrics.contentOffset.y >= metrics.contentSize.height - threshold
}
