import type { ImageSourcePropType } from 'react-native'
import { uploadContentUrl } from '@/src/api/uploads'

export function displayName(
  first?: string | null,
  last?: string | null,
  fallback = '',
): string {
  const joined = [first, last].filter(Boolean).join(' ')
  return joined || fallback
}

export function formatMoney(value: string | number | null | undefined, symbol = '₪'): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'))
  if (!Number.isFinite(n)) return `${symbol} 0`
  return `${symbol} ${Math.round(n).toLocaleString('he-IL')}`
}

export function imageFromUpload(
  uploadId: string | null | undefined,
  fallback: ImageSourcePropType,
): ImageSourcePropType {
  return uploadId ? { uri: uploadContentUrl(uploadId) } : fallback
}

export function splitFullName(fullName: string): { firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') || undefined }
}

type ContentBlock = { type?: string; text?: string; q?: string; a?: string }

/** Flatten CMS `ContentPage.body` JSON into readable text. */
export function contentBodyText(body: unknown, fallback: string): string {
  if (!body) return fallback
  if (typeof body === 'string' && body.trim()) return body
  if (typeof body === 'object') {
    const record = body as { blocks?: ContentBlock[]; text?: string }
    if (typeof record.text === 'string' && record.text.trim()) return record.text
    if (Array.isArray(record.blocks)) {
      const joined = record.blocks
        .map((block) => block.text || [block.q, block.a].filter(Boolean).join('\n'))
        .filter(Boolean)
        .join('\n\n')
      if (joined) return joined
    }
  }
  return fallback
}
