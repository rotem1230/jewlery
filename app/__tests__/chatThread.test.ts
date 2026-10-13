import { ApiError } from '../src/lib/api'
import {
  applyReadEvent,
  latestReadAt,
  messageDelivery,
  peerLastReadAt,
  restoreDraft,
  sendErrorMessage,
} from '../src/lib/chatThread'
import type { ConversationParticipant } from '../src/types/api'

function participant(userId: string, lastReadAt: string | null): ConversationParticipant {
  return {
    id: `p-${userId}`,
    conversationId: 'c1',
    userId,
    lastReadAt,
    user: { id: userId, firstName: null, lastName: null, avatarUploadId: null },
  }
}

describe('read ticks: a sent message is read only once the other side read past it', () => {
  it('takes the other participant’s last read, never my own', () => {
    expect(peerLastReadAt([participant('me', '2026-10-01T12:00:00.000Z'), participant('peer', null)], 'me')).toBeNull()
    expect(
      peerLastReadAt([participant('me', '2026-10-01T12:00:00.000Z'), participant('peer', '2026-10-01T10:00:00.000Z')], 'me'),
    ).toBe('2026-10-01T10:00:00.000Z')
  })

  it('is "read" when the other side’s last read is at or after the message, else "sent"', () => {
    const at = '2026-10-01T10:00:00.000Z'
    expect(messageDelivery(at, null)).toBe('sent')
    expect(messageDelivery(at, '2026-10-01T09:59:59.999Z')).toBe('sent')
    expect(messageDelivery(at, at)).toBe('read')
    expect(messageDelivery(at, '2026-10-01T10:00:01.000Z')).toBe('read')
  })

  it('a `message:read` from the other side in this conversation moves the mark forward', () => {
    const event = { conversationId: 'c1', userId: 'peer', lastReadAt: '2026-10-01T11:00:00.000Z' }
    expect(applyReadEvent(null, event, 'c1', 'me')).toBe('2026-10-01T11:00:00.000Z')
    expect(applyReadEvent('2026-10-01T10:00:00.000Z', event, 'c1', 'me')).toBe('2026-10-01T11:00:00.000Z')
  })

  it('ignores my own reads, other conversations, older marks and malformed events', () => {
    const current = '2026-10-01T11:00:00.000Z'
    expect(applyReadEvent(current, { conversationId: 'c1', userId: 'me', lastReadAt: '2026-10-01T12:00:00.000Z' }, 'c1', 'me')).toBe(current)
    expect(applyReadEvent(current, { conversationId: 'c2', userId: 'peer', lastReadAt: '2026-10-01T12:00:00.000Z' }, 'c1', 'me')).toBe(current)
    expect(applyReadEvent(current, { conversationId: 'c1', userId: 'peer', lastReadAt: '2026-10-01T10:00:00.000Z' }, 'c1', 'me')).toBe(current)
    expect(applyReadEvent(current, { conversationId: 'c1', userId: 'peer', lastReadAt: 'not a date' }, 'c1', 'me')).toBe(current)
    expect(applyReadEvent(current, null, 'c1', 'me')).toBe(current)
  })

  it('the later of two marks wins (e.g. inbox value vs. a fresh lookup)', () => {
    expect(latestReadAt(null, '2026-10-01T10:00:00.000Z')).toBe('2026-10-01T10:00:00.000Z')
    expect(latestReadAt('2026-10-01T11:00:00.000Z', '2026-10-01T10:00:00.000Z')).toBe('2026-10-01T11:00:00.000Z')
    expect(latestReadAt(undefined, null)).toBeNull()
  })
})

describe('a failed send keeps what the user wrote', () => {
  it('puts the failed text back into an empty input', () => {
    expect(restoreDraft('', 'שלום, מה המחיר?')).toBe('שלום, מה המחיר?')
    expect(restoreDraft('   ', 'שלום')).toBe('שלום')
  })

  it('keeps anything typed meanwhile, after the failed text', () => {
    expect(restoreDraft('ועוד שאלה', 'שלום')).toBe('שלום\nועוד שאלה')
  })

  it('explains a known server refusal, otherwise the generic send error', () => {
    const expired = new ApiError(409, '/x', JSON.stringify({ success: false, message: 'This listing has expired', code: 'DESIGN_EXPIRED' }))
    expect(sendErrorMessage(expired)).toBe('תקופת הפרסום של העיצוב הסתיימה')
    expect(sendErrorMessage(new ApiError(0, '/x', 'Network request failed'))).toBe('משהו השתבש בשליחת ההודעה. נסו שוב.')
    expect(sendErrorMessage(new ApiError(403, '/x', JSON.stringify({ message: 'Not a participant of this conversation' })))).toBe(
      'משהו השתבש בשליחת ההודעה. נסו שוב.',
    )
  })
})
