import { useCallback, useEffect, useRef, useState } from 'react'
import { onPlaybackProgress, playVoiceNote, stopVoicePlayback } from '@/src/lib/voiceNotes'

/**
 * Single-active voice-note playback across the thread (playing a second note
 * stops the first — `playVoiceNote` already stops the native player; this
 * hook keeps exactly one bubble in the "playing" visual state).
 */
export function useVoicePlayback() {
  const [playingUri, setPlayingUri] = useState<string | null>(null)
  const [positionMs, setPositionMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void stopVoicePlayback()
    }
  }, [])

  const toggle = useCallback(
    async (uri: string) => {
      if (playingUri === uri) {
        await stopVoicePlayback()
        if (mountedRef.current) {
          setPlayingUri(null)
          setPositionMs(0)
        }
        return
      }
      onPlaybackProgress(
        (position, duration) => {
          if (!mountedRef.current) return
          setPositionMs(position)
          setDurationMs(duration)
        },
        () => {
          if (mountedRef.current) {
            setPlayingUri(null)
            setPositionMs(0)
          }
        },
      )
      await playVoiceNote(uri)
      if (mountedRef.current) {
        setPlayingUri(uri)
        setPositionMs(0)
      }
    },
    [playingUri],
  )

  return { playingUri, positionMs, durationMs, toggle }
}
