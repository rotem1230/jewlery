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

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'retry') => {
    const controller = new AbortController()
    if (mountedRef.current) {
      setStatus(mode === 'initial' ? 'loading' : 'refreshing')
      if (mode !== 'refresh') setError(null)
    }
    try {
      const result = await loaderRef.current(controller.signal)
      if (!mountedRef.current) return
      setData(result)
      setError(null)
      setStatus('success')
    } catch (err) {
      if (!mountedRef.current) return
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err : new Error('Failed to load'))
      setStatus(mode === 'initial' ? 'error' : 'success')
    }
    return () => controller.abort()
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
