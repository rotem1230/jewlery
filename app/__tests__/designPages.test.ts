import { appendDesignPage, canLoadMoreDesigns, firstDesignPage, isNearListEnd } from '../src/lib/designPages'
import type { DesignListItem, DesignListResponse } from '../src/types/api'

function design(id: string): DesignListItem {
  return {
    id,
    title: id,
    description: null,
    status: 'DRAFT',
    thumbnailUploadId: null,
    parameters: {},
    publishedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    quoteCount: 0,
  }
}

function page(n: number, ids: string[], totalPages: number, total = 45): DesignListResponse {
  return {
    items: ids.map(design),
    pagination: { page: n, pageSize: 20, total, totalPages },
    tabCounts: { all: total, drafts: total, published: 0, completed: 0, archive: 0 },
  }
}

describe('My designs pagination (every design of a tab is reachable, not only the first 20)', () => {
  it('starts from the first page and knows whether more pages exist', () => {
    const state = firstDesignPage('all', page(1, ['a', 'b'], 3))
    expect(state.items.map((d) => d.id)).toEqual(['a', 'b'])
    expect(canLoadMoreDesigns(state)).toBe(true)
    expect(canLoadMoreDesigns(firstDesignPage('all', page(1, ['a'], 1, 1)))).toBe(false)
  })

  it('appends the next page, without repeating a design that moved between pages', () => {
    let state = firstDesignPage('all', page(1, ['a', 'b'], 3))
    state = appendDesignPage(state, 'all', page(2, ['b', 'c'], 3))
    expect(state.items.map((d) => d.id)).toEqual(['a', 'b', 'c'])
    expect(state.page).toBe(2)
    state = appendDesignPage(state, 'all', page(3, ['d'], 3))
    expect(state.items.map((d) => d.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(canLoadMoreDesigns(state)).toBe(false)
  })

  it('ignores a page that belongs to another tab or arrives out of order', () => {
    const state = firstDesignPage('draft', page(1, ['a'], 3))
    expect(appendDesignPage(state, 'all', page(2, ['x'], 3))).toBe(state)
    expect(appendDesignPage(state, 'draft', page(3, ['x'], 3))).toBe(state)
  })

  it('takes the tab counts from the latest answer', () => {
    const state = appendDesignPage(firstDesignPage('all', page(1, ['a'], 2, 10)), 'all', page(2, ['b'], 2, 11))
    expect(state.tabCounts.all).toBe(11)
  })
})

describe('loading more on scroll', () => {
  const at = (offsetY: number) => ({
    layoutMeasurement: { height: 600 },
    contentOffset: { y: offsetY },
    contentSize: { height: 2000 },
  })

  it('is near the end only close to the bottom of the content', () => {
    expect(isNearListEnd(at(0))).toBe(false)
    expect(isNearListEnd(at(1000))).toBe(false)
    expect(isNearListEnd(at(1250))).toBe(true)
    expect(isNearListEnd(at(1400))).toBe(true)
  })
})
