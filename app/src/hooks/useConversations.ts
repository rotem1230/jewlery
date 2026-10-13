import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { ImageSourcePropType } from 'react-native'
import { listConversations } from '@/src/api/chat'
import { useAppSelector } from '@/src/store/hooks'
import {
  conversationRow,
  inboxHasMore,
  inboxParams,
  inboxReducer,
  initialInboxState,
  mergeFilterOptions,
  type InboxFilterOptions,
  type InboxFilters,
  type InboxLoadMode,
  type InboxRow,
} from '@/src/lib/inbox'
import { useTranslation } from '@/src/i18n'
import jewelerAvatar from '../../assets/images/designs/jeweler-avatar-1.png'

export type ConversationRow = InboxRow & { avatar: ImageSourcePropType }

const NO_OPTIONS: InboxFilterOptions = { designs: [], peers: [] }

/**
 * Conversation inbox: server-sorted (newest `lastMessageAt` first), backend unread counts,
 * debounced server-side search and filters, page-by-page "load more", and a refetch of the
 * first page on focus so badges clear after reading a thread (loaded pages are kept).
 */
export function useConversations(filters: Omit<InboxFilters, 'q'> = {}) {
  const { locale } = useTranslation()
  const myUserId = useAppSelector((s) => s.auth.user?.id)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [state, dispatch] = useReducer(inboxReducer, initialInboxState)
  const [options, setOptions] = useState<InboxFilterOptions>(NO_OPTIONS)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => clearTimeout(timer)
  }, [query])

  const { designId, peerUserId, from, to } = filters
  const active = useMemo<InboxFilters>(
    () => ({ q: debouncedQuery, designId, peerUserId, from, to }),
    [debouncedQuery, designId, peerUserId, from, to],
  )

  // The reducer drops answers for an older search; the refs give callbacks the current values.
  // `generationRef` counts searches exactly like the reducer does (one `query` per `load`).
  const stateRef = useRef(state)
  stateRef.current = state
  const generationRef = useRef(initialInboxState.generation)
  const activeRef = useRef(active)
  activeRef.current = active
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchPage = useCallback((mode: InboxLoadMode, page: number, generation: number) => {
    listConversations(inboxParams(activeRef.current, page)).then(
      (response) => {
        if (mountedRef.current) dispatch({ type: 'loaded', generation, mode, response })
      },
      (err: unknown) => {
        if (!mountedRef.current) return
        dispatch({ type: 'failed', generation, mode, error: err instanceof Error ? err : new Error('Failed to load') })
      },
    )
  }, [])

  const load = useCallback(() => {
    generationRef.current += 1
    dispatch({ type: 'query' })
    fetchPage('replace', 1, generationRef.current)
  }, [fetchPage])

  useEffect(() => {
    load()
  }, [load, active, accessToken])

  const refresh = useCallback(() => {
    dispatch({ type: 'refresh' })
    fetchPage('refresh', 1, generationRef.current)
  }, [fetchPage])

  const loadMore = useCallback(() => {
    const current = stateRef.current
    if (current.loadingMore || !inboxHasMore(current)) return
    dispatch({ type: 'more' })
    fetchPage('append', current.page + 1, generationRef.current)
  }, [fetchPage])

  // Badges change after reading / receiving messages elsewhere: refetch every time the tab
  // regains focus. The first focus is the initial mount load itself.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      refresh()
    }, [refresh]),
  )

  const rows = useMemo<ConversationRow[]>(
    () => state.items.map((conv) => ({ ...conversationRow(conv, myUserId, locale), avatar: jewelerAvatar })),
    [state.items, myUserId, locale],
  )

  useEffect(() => {
    setOptions((prev) => mergeFilterOptions(prev, rows))
  }, [rows])

  return {
    rows,
    loading: state.status === 'loading',
    refreshing: state.refreshing,
    loadingMore: state.loadingMore,
    error: state.status === 'error' ? state.error : null,
    hasMore: inboxHasMore(state),
    refresh,
    retry: load,
    loadMore,
    query,
    setQuery,
    filterOptions: options,
  }
}
