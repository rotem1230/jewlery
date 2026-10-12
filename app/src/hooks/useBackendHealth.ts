import { useEffect, useState } from 'react'
import { API_BASE_URL, getHealth } from '@/src/lib/api'

export type BackendStatus = 'checking' | 'online' | 'offline'

/** Ping the local backend `/health` endpoint. Re-runs once on mount. */
export function useBackendHealth(): { status: BackendStatus; baseUrl: string } {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    getHealth(controller.signal)
      .then(() => setStatus('online'))
      .catch(() => setStatus('offline'))
      .finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [])

  return { status, baseUrl: API_BASE_URL }
}
