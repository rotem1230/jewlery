import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ImageSourcePropType } from 'react-native'
import {
  getConversationMessages,
  markConversationRead,
  sendAudioMessage,
  sendConversationMessage,
  sendImageMessage,
} from '@/src/api/chat'
import { uploadChatFile, uploadContentUrl, type LocalFile } from '@/src/api/uploads'
import { mediaUrl, nextLinkRefreshDelay } from '@/src/lib/media'
import { connectConversationSocket, type ConversationSocket } from '@/src/lib/socket'
import { formatClock, formatDayLabel, groupMessagesByDay } from '@/src/lib/chatTime'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation } from '@/src/i18n'
import { useVoicePlayback } from '@/src/hooks/useVoicePlayback'
import type { ChatMessage, QuoteSummary } from '@/src/types/api'
import jewelerAvatar from '../../assets/images/designs/jeweler-avatar-1.png'

export type ThreadBubble = {
  id: string
  kind: 'text' | 'image' | 'audio' | 'system'
  side: 'incoming' | 'outgoing'
  text: string
  /** Remote attachment URL for image/audio bubbles. */
  mediaUri?: string
  time: string
  avatar?: ImageSourcePropType
  avatarLabel?: string
}

export type ThreadDayGroup = {
  dayKey: string
  dayLabel: string
  items: ThreadBubble[]
}

const PAGE_LIMIT = 50
/** After a failed link refresh, the next try waits at least this long. */
const LINK_REFRESH_RETRY_MS = 30_000

/**
 * Single conversation: chronological messages with day separators, cursor
 * pagination backwards, send, mark-read on open, and realtime `message:new`
 * over the `/ws` socket (deduplicated by id).
 */
export function useConversationThread(conversationId: string) {
  const { locale } = useTranslation()
  const myUserId = useAppSelector((s) => s.auth.user?.id)
  const myFirstName = useAppSelector((s) => s.auth.user?.firstName)
  const accessToken = useAppSelector((s) => s.auth.accessToken)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const socketRef = useRef<ConversationSocket | null>(null)
  const mountedRef = useRef(true)
  const playback = useVoicePlayback()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const appendUnique = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id))
      const fresh = incoming.filter((m) => !known.has(m.id))
      if (fresh.length === 0) return prev
      return [...prev, ...fresh].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    })
  }, [])

  const loadInitial = useCallback(async () => {
    const controller = new AbortController()
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }
    try {
      const page = await getConversationMessages(conversationId, {
        limit: PAGE_LIMIT,
        signal: controller.signal,
      })
      if (!mountedRef.current) return
      setMessages(page.items)
      setNextCursor(page.nextCursor)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err : new Error('Failed to load messages'))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial, accessToken])

  // Images and voice notes are served through signed links that expire (15 minutes by default):
  // shortly before the first one in the newest page does, that page is fetched again and its
  // messages, with fresh links, replace the ones held. Older pages keep theirs until reopened.
  const [linkRefreshFailures, setLinkRefreshFailures] = useState(0)
  useEffect(() => {
    const due = nextLinkRefreshDelay(messages.slice(-PAGE_LIMIT).map((m) => m.imageUpload?.contentUrl))
    if (due === null) return
    const delay = linkRefreshFailures > 0 ? Math.max(due, LINK_REFRESH_RETRY_MS) : due
    let cancelled = false
    const timer = setTimeout(() => {
      getConversationMessages(conversationId, { limit: PAGE_LIMIT })
        .then((page) => {
          if (cancelled || !mountedRef.current) return
          const fresh = new Map(page.items.map((m) => [m.id, m]))
          setMessages((prev) => prev.map((m) => fresh.get(m.id) ?? m))
          // A link the reload did not renew (its message was not in the page) is retried slowly,
          // never in a tight loop.
          const renewed = messages.slice(-PAGE_LIMIT).map((m) => (fresh.get(m.id) ?? m).imageUpload?.contentUrl)
          const stillDue = nextLinkRefreshDelay(renewed)
          setLinkRefreshFailures(stillDue !== null && stillDue <= LINK_REFRESH_RETRY_MS ? (n) => n + 1 : 0)
        })
        .catch(() => {
          if (!cancelled && mountedRef.current) setLinkRefreshFailures((n) => n + 1)
        })
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [messages, conversationId, linkRefreshFailures])

  const loadEarlier = useCallback(async () => {
    if (!nextCursor || loadingEarlier) return
    setLoadingEarlier(true)
    try {
      const page = await getConversationMessages(conversationId, {
        cursor: nextCursor,
        limit: PAGE_LIMIT,
      })
      if (!mountedRef.current) return
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id))
        const older = page.items.filter((m) => !known.has(m.id))
        return [...older, ...prev].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
      })
      setNextCursor(page.nextCursor)
    } catch {
      // Keep the loaded history; user can retry via the button.
    } finally {
      if (mountedRef.current) setLoadingEarlier(false)
    }
  }, [conversationId, nextCursor, loadingEarlier])

  const markRead = useCallback(async () => {
    try {
      await markConversationRead(conversationId)
    } catch {
      // Badge sync is best-effort; the list refetches on focus anyway.
    }
  }, [conversationId])

  // Opening a thread marks it read (clears the list badge).
  useEffect(() => {
    void markRead()
  }, [markRead])

  // Realtime: join the room, append peer messages, mark read while open.
  useEffect(() => {
    if (!accessToken) return
    const conn = connectConversationSocket(accessToken)
    socketRef.current = conn
    conn.join(conversationId)
    const onNew = (msg: ChatMessage) => {
      if (!msg || msg.conversationId !== conversationId) return
      appendUnique([msg])
      if (msg.senderId !== myUserId) void markRead()
    }
    conn.socket.on('message:new', onNew)
    return () => {
      conn.socket.off('message:new', onNew)
      conn.leave(conversationId)
      conn.disconnect()
      socketRef.current = null
    }
  }, [conversationId, accessToken, appendUnique, markRead, myUserId])

  const send = useCallback(
    async (body: string) => {
      const text = body.trim()
      if (!text || sending) return
      setSending(true)
      try {
        const created = await sendConversationMessage(conversationId, text)
        if (mountedRef.current) appendUnique([created])
      } finally {
        if (mountedRef.current) setSending(false)
      }
    },
    [conversationId, sending, appendUnique],
  )

  /** Uploads a photo then sends it as an IMAGE message (throws on failure). */
  const sendImageFile = useCallback(
    async (file: LocalFile) => {
      setUploading(true)
      try {
        const upload = await uploadChatFile(file)
        const created = await sendImageMessage(conversationId, upload.id)
        if (mountedRef.current) appendUnique([created])
      } finally {
        if (mountedRef.current) setUploading(false)
      }
    },
    [conversationId, appendUnique],
  )

  /** Uploads a recorded voice file then sends it as an AUDIO message. */
  const sendAudioFile = useCallback(
    async (file: LocalFile) => {
      setUploading(true)
      try {
        const upload = await uploadChatFile(file)
        const created = await sendAudioMessage(conversationId, upload.id)
        if (mountedRef.current) appendUnique([created])
      } finally {
        if (mountedRef.current) setUploading(false)
      }
    },
    [conversationId, appendUnique],
  )

  const groups = useMemo<ThreadDayGroup[]>(() => {
    const mine = myUserId ?? ''
    return groupMessagesByDay(messages)
      .map((group) => ({
        dayKey: group.dayKey,
        dayLabel: group.items.length > 0 ? formatDayLabel(group.items[0].createdAt, locale) : '',
        items: group.items
          .filter((msg) => msg.type !== 'QUOTE_CARD')
          .map((msg): ThreadBubble => {
            const outgoing = msg.senderId === mine
            const base = {
              id: msg.id,
              side: (outgoing ? 'outgoing' : 'incoming') as 'incoming' | 'outgoing',
              text: msg.body ?? '',
              time: formatClock(msg.createdAt),
              ...(outgoing
                ? { avatarLabel: (myFirstName ?? 'מ').charAt(0) }
                : { avatar: jewelerAvatar }),
            }
            if (msg.type === 'SYSTEM') {
              return { ...base, kind: 'system', text: msg.body || msg.type }
            }
            if (msg.type === 'IMAGE' && msg.imageUploadId) {
              return { ...base, kind: 'image', mediaUri: mediaUrl(msg.imageUpload?.contentUrl) ?? uploadContentUrl(msg.imageUploadId) }
            }
            if (msg.type === 'AUDIO' && msg.imageUploadId) {
              return { ...base, kind: 'audio', mediaUri: mediaUrl(msg.imageUpload?.contentUrl) ?? uploadContentUrl(msg.imageUploadId) }
            }
            return { ...base, kind: 'text' }
          }),
      }))
      .filter((group) => group.items.length > 0)
  }, [messages, myUserId, myFirstName, locale])

  const latestQuote = useMemo(() => {
    const withQuote = [...messages]
      .reverse()
      .find((msg) => msg.type === 'QUOTE_CARD' && (msg.quote || msg.quoteId))
    if (withQuote?.quote) return withQuote.quote
    if (withQuote?.quoteId) return { id: withQuote.quoteId } as QuoteSummary
    return null
  }, [messages])

  return {
    groups,
    latestQuote,
    loading,
    loadingEarlier,
    sending,
    uploading,
    error,
    hasMore: nextCursor !== null,
    retry: loadInitial,
    loadEarlier,
    send,
    sendImageFile,
    sendAudioFile,
    markRead,
    playingUri: playback.playingUri,
    playbackPositionMs: playback.positionMs,
    playbackDurationMs: playback.durationMs,
    togglePlayback: playback.toggle,
  }
}
