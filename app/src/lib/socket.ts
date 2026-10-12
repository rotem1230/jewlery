/** Socket.IO realtime transport for chat (mirrors backend ChatGateway). */
import { io, type Socket } from 'socket.io-client'
import { API_BASE_URL } from '@/src/lib/api'

export const WS_NAMESPACE = '/ws'

function wsBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, '')
}

export type ConversationSocket = {
  socket: Socket
  join: (conversationId: string) => void
  leave: (conversationId: string) => void
  disconnect: () => void
}

/**
 * Connects to `/ws` with the session JWT (same auth as the HTTP API).
 * Caller joins rooms and subscribes to `message:new` / `message:read`.
 */
export function connectConversationSocket(token: string): ConversationSocket {
  const socket = io(`${wsBaseUrl()}${WS_NAMESPACE}`, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
  })
  return {
    socket,
    join: (conversationId: string) => {
      socket.emit('conversation:join', { conversationId })
    },
    leave: (conversationId: string) => {
      socket.emit('conversation:leave', { conversationId })
    },
    disconnect: () => {
      socket.disconnect()
    },
  }
}
