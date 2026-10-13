import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error'

type Loader<T> = (signal: AbortSignal) => Promise<T>

/**
 * DRY async-data hook used by every backend-backed screen:
 * initial loading, pull-to-refresh, and retry share one code path.
 *
 * Pass `deps` for values that must trigger a reload when they change —
 * e.g. the session token, so screens refetch after sign-in completes.
 */
export function useAsyncData<T>(loader: Loader<T>, opts?: { immediate?: boolean; deps?: unknown[] }) {
  const immediate = opts?.immediate ?? true
  const deps = opts?.deps ?? []
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const [data, setData] = useState<T | null>(null)
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)
  // Only the latest request may write: a filter change or refresh supersedes (and aborts) the one
  // in flight, so a slower older answer never replaces a newer one.
  const activeRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      activeRef.current?.abort()
    }
  }, [])

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'retry') => {
    activeRef.current?.abort()
    const controller = new AbortController()
    activeRef.current = controller
    const isCurrent = () => mountedRef.current && activeRef.current === controller
    if (mountedRef.current) {
      setStatus(mode === 'initial' ? 'loading' : 'refreshing')
      if (mode !== 'refresh') setError(null)
    }
    try {
      const result = await loaderRef.current(controller.signal)
      if (!isCurrent()) return
      setData(result)
      setError(null)
      setStatus('success')
    } catch (err) {
      if (!isCurrent()) return
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err : new Error('Failed to load'))
      setStatus(mode === 'initial' ? 'error' : 'success')
    } finally {
      if (activeRef.current === controller) activeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!immediate) return
    void load('initial')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, load, ...deps])

  const refresh = useCallback(() => load('refresh'), [load])
  const retry = useCallback(() => load('retry'), [load])

  return {
    data,
    status,
    error,
    loading: status === 'loading' || status === 'idle',
    refreshing: status === 'refreshing',
    hasData: data !== null,
    refresh,
    retry,
  }
}
