/** The terms of use as the CMS publishes them, and the disclaimer before working with a jeweler. */
import { Alert } from 'react-native'
import type { TranslationKey } from '@/src/i18n'

export type LegalBlockType = 'heading' | 'section' | 'subheading' | 'paragraph' | 'item'
export type LegalBlock = { type: LegalBlockType; text: string; id?: string }

const TYPES: LegalBlockType[] = ['heading', 'section', 'subheading', 'paragraph', 'item']

type RawBlock = { type?: unknown; text?: unknown; id?: unknown; q?: unknown; a?: unknown }

/**
 * The page body as blocks to show (a heading, a part, a clause...); an unknown kind is a
 * paragraph and an empty block is left out. Null when there is nothing to show.
 */
export function legalBlocks(body: unknown): LegalBlock[] | null {
  if (typeof body === 'string') return body.trim() ? [{ type: 'paragraph', text: body }] : null
  if (!body || typeof body !== 'object') return null
  const record = body as { blocks?: unknown; text?: unknown }
  if (typeof record.text === 'string' && record.text.trim()) return [{ type: 'paragraph', text: record.text }]
  if (!Array.isArray(record.blocks)) return null
  const blocks: LegalBlock[] = []
  for (const raw of record.blocks as RawBlock[]) {
    const text =
      typeof raw?.text === 'string' && raw.text.trim()
        ? raw.text
        : [raw?.q, raw?.a].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join('\n')
    if (!text) continue
    const type = TYPES.includes(raw.type as LegalBlockType) ? (raw.type as LegalBlockType) : 'paragraph'
    blocks.push({ type, text, ...(typeof raw.id === 'string' ? { id: raw.id } : {}) })
  }
  return blocks.length > 0 ? blocks : null
}

/**
 * Section 5.4 of the terms: before an engagement with a jeweler (a request for a quote, approving
 * one) the user is told it is an independent engagement. Resolves true only when they continue.
 */
export function confirmJewelerEngagement(t: (key: TranslationKey) => string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('jewelerDisclaimerTitle'),
      t('jewelerDisclaimer'),
      [
        { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('jewelerDisclaimerContinue'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}
