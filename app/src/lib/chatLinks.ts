const WHATSAPP_LINK = /^https:\/\/wa\.me\/\d{8,15}$/

/**
 * The direct-contact link a handoff system message carries (PRD 5.6), when it is a WhatsApp link
 * to a phone number. Anything else in a message payload is never opened.
 */
export function contactLinkFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const url = (payload as { whatsappUrl?: unknown }).whatsappUrl
  return typeof url === 'string' && WHATSAPP_LINK.test(url) ? url : undefined
}
