/**
 * Conversation thread rules kept out of the hook: read ticks from the participants'
 * `lastReadAt` (+ `message:read` over the socket), and keeping the draft of a failed send.
 */
import { t } from '@/src/i18n'
import { knownApiErrorMessage } from '@/src/lib/api'
import type { ConversationParticipant } from '@/src/types/api'

export type Delivery = 'sent' | 'read'

function time(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** The later of two read marks (either may be missing). */
export function latestReadAt(a: string | null | undefined, b: string | null | undefined): string | null {
  const ta = time(a)
  const tb = time(b)
  if (ta === null) return tb === null ? null : (b as string)
  if (tb === null) return a as string
  return tb > ta ? (b as string) : (a as string)
}

/** How far the other participant(s) have read; my own mark never counts. */
export function peerLastReadAt(participants: ConversationParticipant[], myUserId: string | undefined): string | null {
  return participants
    .filter((p) => p.userId !== myUserId)
    .reduce<string | null>((latest, p) => latestReadAt(latest, p.lastReadAt), null)
}

/** A sent message is read only when the other side's last read is at or after it. */
export function messageDelivery(createdAt: string, peerReadAt: string | null): Delivery {
  const read = time(peerReadAt)
  const created = time(createdAt)
  return read !== null && created !== null && read >= created ? 'read' : 'sent'
}

/**
 * Socket `message:read` `{ conversationId, userId, lastReadAt }`: moves the other side's mark
 * forward. My own reads, other rooms, older marks and malformed payloads leave it unchanged.
 */
export function applyReadEvent(
  current: string | null,
  event: unknown,
  conversationId: string,
  myUserId: string | undefined,
): string | null {
  if (!event || typeof event !== 'object') return current
  const { conversationId: room, userId, lastReadAt } = event as Record<string, unknown>
  if (room !== conversationId || typeof userId !== 'string' || userId === myUserId) return current
  if (typeof lastReadAt !== 'string' || time(lastReadAt) === null) return current
  return latestReadAt(current, lastReadAt)
}

/** The text of a send that failed goes back into the input, before anything typed since. */
export function restoreDraft(current: string, failed: string): string {
  return current.trim() ? `${failed}\n${current}` : failed
}

/** A refusal the server explains (e.g. DESIGN_EXPIRED), otherwise the generic send error. */
export function sendErrorMessage(err: unknown): string {
  return knownApiErrorMessage(err) ?? t('chatSendFailedMessage')
}
