import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { ImageSourcePropType } from 'react-native'
import { listConversations } from '@/src/api/chat'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { formatChatTime } from '@/src/lib/chatTime'
import { useTranslation } from '@/src/i18n'
import jewelerAvatar from '../../assets/images/designs/jeweler-avatar-1.png'

export type ConversationRow = {
  id: string
  name: string
  design: string
  designId: string
  peerUserId: string | null
  preview: string
  time: string
  unread: number
  avatar: ImageSourcePropType
  createdAt: string
}

function fullName(first: string | null, last: string | null, fallback: string): string {
  const joined = [first, last].filter(Boolean).join(' ')
  return joined || fallback
}

/**
 * Conversation list: server-sorted (newest `lastMessageAt` first),
 * backend unread counts, debounced server search, refetch on focus so
 * badges clear after reading a thread.
 */
export function useConversations(extra?: {
  designId?: string
  peerUserId?: string
  from?: string
  to?: string
}) {
  const { t, locale } = useTranslation()
  const myUserId = useAppSelector((s) => s.auth.user?.id)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(
    (signal: AbortSignal) =>
      listConversations(
        {
          q: debouncedQuery || undefined,
          designId: extra?.designId,
          peerUserId: extra?.peerUserId,
          from: extra?.from,
          to: extra?.to,
        },
        signal,
      ),
    [debouncedQuery, extra?.designId, extra?.peerUserId, extra?.from, extra?.to],
  )
  const data = useAsyncData(load, { deps: [accessToken, debouncedQuery] })

  // Badges change after reading / receiving messages elsewhere: refetch every
  // time the tab regains focus. Refs avoid the stale closure (data identity
  // changes each render); the first focus is the initial mount load itself.
  const refreshRef = useRef(data.refresh)
  refreshRef.current = data.refresh
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      void refreshRef.current()
    }, []),
  )

  const rows = useMemo<ConversationRow[]>(() => {
    const items = data.data?.items ?? []
    return items.map((conv) => {
      const peer =
        conv.participants.find((p) => p.userId !== myUserId)?.user ??
        conv.participants[0]?.user
      const last = conv.lastMessage
      const preview =
        !last || last.type === 'TEXT'
          ? (last?.body ?? '')
          : last.type === 'IMAGE'
            ? t('chatPreviewImage')
            : last.type === 'AUDIO'
              ? t('chatPreviewAudio')
              : (last.body ?? '')
      return {
        id: conv.id,
        name: peer ? fullName(peer.firstName, peer.lastName, t('chatThreadTitle')) : t('chatThreadTitle'),
        design: conv.design.title ?? '',
        designId: conv.designId,
        peerUserId: peer?.id ?? null,
        preview,
        time: formatChatTime(conv.lastMessageAt, locale),
        unread: conv.unreadCount,
        avatar: jewelerAvatar,
        createdAt: conv.createdAt,
      }
    })
  }, [data.data, myUserId, t, locale])

  return { ...data, rows, query, setQuery }
}
