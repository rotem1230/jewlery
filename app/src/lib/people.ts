/**
 * How a person is shown in lists and chats (PRD 5.6): a jeweler by their business name, anyone
 * else by their own name; pictured by their own photo, else a jeweler's business logo, else
 * their initials — never a stock photo of somebody else.
 */
import type { ImageSourcePropType } from 'react-native'
import { displayName } from '@/src/lib/format'
import { mediaUrl } from '@/src/lib/media'

export type PersonLike =
  | {
      firstName?: string | null
      lastName?: string | null
      /** Set by the API for the jeweler of a conversation. */
      businessName?: string | null
      /** Signed links (see mediaUrl). */
      avatarUrl?: string | null
      logoUrl?: string | null
    }
  | null
  | undefined

export function personName(person: PersonLike, fallback: string): string {
  return person?.businessName?.trim() || displayName(person?.firstName, person?.lastName, fallback)
}

/** The person's own photo, else their business logo; undefined when there is neither. */
export function personPhotoUri(person: PersonLike): string | undefined {
  return mediaUrl(person?.avatarUrl) ?? mediaUrl(person?.logoUrl)
}

/** "QA Goldsmith" → "QG", "דנה לוי" → "דל": the first letters of the first two words. */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase()
}

/** Avatar props of a chat bubble: the photo or logo when there is one, and always the initials. */
export function avatarProps(
  person: PersonLike,
  fallback: string,
): { avatar: ImageSourcePropType | undefined; avatarLabel: string } {
  const uri = personPhotoUri(person)
  return { avatar: uri ? { uri } : undefined, avatarLabel: initialsOf(personName(person, fallback)) }
}
