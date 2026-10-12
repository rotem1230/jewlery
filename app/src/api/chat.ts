/** Chat endpoints (authenticated via the session token). */
import { apiGet, apiPost, buildQuery } from '@/src/lib/api'
import type { ChatMessage, ConversationItem, MessagePage, Paginated } from '@/src/types/api'

export type ListConversationsParams = {
  q?: string
  designId?: string
  peerUserId?: string
  from?: string
  to?: string
  page?: number
}

/** Conversations, newest first by `lastMessageAt` (server-sorted). */
export function listConversations(
  params?: ListConversationsParams,
  signal?: AbortSignal,
): Promise<Paginated<ConversationItem>> {
  return apiGet<Paginated<ConversationItem>>(`/conversations${buildQuery(params ?? {})}`, { signal })
}

export function getConversationMessages(
  conversationId: string,
  opts?: { cursor?: string; limit?: number; signal?: AbortSignal },
): Promise<MessagePage> {
  const { signal, ...params } = opts ?? {}
  return apiGet<MessagePage>(`/conversations/${conversationId}/messages${buildQuery(params)}`, {
    signal,
  })
}

export function sendConversationMessage(conversationId: string, body: string): Promise<ChatMessage> {
  return apiPost<ChatMessage>(`/conversations/${conversationId}/messages`, { type: 'TEXT', body })
}

export function sendImageMessage(conversationId: string, uploadId: string): Promise<ChatMessage> {
  return apiPost<ChatMessage>(`/conversations/${conversationId}/messages`, {
    type: 'IMAGE',
    imageUploadId: uploadId,
  })
}

export function sendAudioMessage(conversationId: string, uploadId: string): Promise<ChatMessage> {
  return apiPost<ChatMessage>(`/conversations/${conversationId}/messages`, {
    type: 'AUDIO',
    imageUploadId: uploadId,
  })
}

/** Marks the conversation read up to now (clears the unread badge). */
export function markConversationRead(conversationId: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(`/conversations/${conversationId}/read`, {})
}

/** Find-or-create a conversation for a design + the other participant(s). */
export function createConversation(
  designId: string,
  participantUserIds: string[],
): Promise<ConversationItem> {
  return apiPost<ConversationItem>('/conversations', { designId, participantUserIds })
}
