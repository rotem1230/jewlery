/**
 * What the designer can do with one of their designs. A design with an accepted quote is a deal on
 * its exact specification: the server refuses edits and re-publishing (409 DESIGN_COMPLETED), so
 * the app offers none and the studio only views it.
 */
import { apiErrorCode, ApiError, parseApiError } from '@/src/lib/api'
import { isolate } from '@/src/lib/rtl'
import type { DesignStatus, Region } from '@/src/types/api'

type Locale = 'he' | 'en' | string

type DesignState = {
  status: DesignStatus
  completedBy?: { id: string; name: string | null } | null
}

export type DesignActionSet = {
  readOnly: boolean
  editInStudio: boolean
  viewInStudio: boolean
  editDetails: boolean
  publish: boolean
  archive: boolean
  moveToDrafts: boolean
  orderJewelers: boolean
  duplicate: boolean
  /** Delete it (soft). The server still refuses while a jeweler works on it (409 DESIGN_IN_WORK). */
  remove: boolean
}

/** Completed, or archived after a quote was accepted (the completing jeweler stays recorded). */
export function isDesignReadOnly(design: DesignState): boolean {
  return design.status === 'COMPLETED' || Boolean(design.completedBy)
}

export function designActions(design: DesignState): DesignActionSet {
  const readOnly = isDesignReadOnly(design)
  const none: DesignActionSet = {
    readOnly,
    editInStudio: false,
    viewInStudio: false,
    editDetails: false,
    publish: false,
    archive: false,
    moveToDrafts: false,
    orderJewelers: false,
    duplicate: true,
    remove: !readOnly,
  }
  if (readOnly) {
    return { ...none, viewInStudio: true, archive: design.status !== 'ARCHIVED' }
  }
  switch (design.status) {
    case 'DRAFT':
      return { ...none, editInStudio: true, editDetails: true, publish: true, archive: true, orderJewelers: true }
    case 'PUBLISHED':
      return { ...none, editInStudio: true, editDetails: true, archive: true, orderJewelers: true }
    case 'ARCHIVED':
      return { ...none, moveToDrafts: true }
    default:
      return none
  }
}

/** "הושלם ע״י צורפות כהן"; null while the design is not completed. */
export function completedByLabel(design: DesignState, locale: Locale): string | null {
  if (!isDesignReadOnly(design)) return null
  const name = design.completedBy?.name?.trim()
  if (locale === 'en') return name ? `Completed by ${name}` : 'Completed'
  // A business name in Latin letters keeps its place in the Hebrew sentence.
  return name ? `הושלם ע״י ${isolate(name)}` : 'הושלם'
}

/** The "no preferred region" choice of the publish sheet. */
export const NO_REGION_ID = 'none'

export function regionOptions(regions: Region[], locale: Locale): Array<{ id: string; label: string }> {
  return [
    { id: NO_REGION_ID, label: locale === 'en' ? 'No region preference' : 'ללא העדפת אזור' },
    ...regions.map((region) => ({
      id: region.id,
      label: locale === 'en' && region.labelEn ? region.labelEn : region.labelHe,
    })),
  ]
}

/**
 * The PATCH that saves the chosen region before publishing; null when nothing changes. "No
 * preference" keeps the design as it is (the field is optional).
 */
export function regionPatchForPublish(
  design: { version: number; preferredRegionId?: string | null },
  chosenRegionId: string | null,
): { version: number; preferredRegionId: string } | null {
  if (!chosenRegionId || chosenRegionId === NO_REGION_ID) return null
  if (chosenRegionId === design.preferredRegionId) return null
  return { version: design.version, preferredRegionId: chosenRegionId }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** "בתוקף עד 12.11.2026" for a published listing; "פג תוקף ב־…" once it lapsed. */
export function listingExpiryLabel(expiresAt: string | null | undefined, locale: Locale, now: Date = new Date()): string | null {
  if (!expiresAt) return null
  const at = new Date(expiresAt)
  if (Number.isNaN(at.getTime())) return null
  const date = `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}`
  const lapsed = at.getTime() <= now.getTime()
  if (locale === 'en') return lapsed ? `Expired on ${date.replace(/\./g, '/')}` : `Listed until ${date.replace(/\./g, '/')}`
  return lapsed ? `פג תוקף ב־${date}` : `בתוקף עד ${date}`
}

export type DesignErrorMessage = { title: string; body: string }

/** Why the server refused to publish or save a design, in the app language. */
export function designErrorMessage(err: unknown, action: 'publish' | 'save' | 'delete', locale: Locale): DesignErrorMessage {
  const en = locale === 'en'
  const code = apiErrorCode(err)
  if (code === 'DESIGN_COMPLETED') {
    return en
      ? { title: 'This design is completed', body: 'A quote was accepted for this design, so it can no longer change. Duplicate it to start a new one.' }
      : { title: 'העיצוב הושלם', body: 'לעיצוב זה כבר אושרה הצעת מחיר ולכן לא ניתן לשנות אותו. אפשר לשכפל אותו ולהתחיל עיצוב חדש.' }
  }
  if (code === 'DESIGN_IN_WORK') {
    return en
      ? { title: 'The design cannot be deleted', body: 'A jeweler is working on this design (a request or a quote is open). You can move it to the archive instead.' }
      : { title: 'לא ניתן למחוק את העיצוב', body: 'צורף עובד על העיצוב הזה (יש בקשה או הצעת מחיר פתוחה). אפשר להעביר אותו לארכיון במקום.' }
  }
  if (code === 'STALE_VERSION') {
    return en
      ? { title: 'The design was updated elsewhere', body: 'Reload the design and try again.' }
      : { title: 'העיצוב עודכן במקום אחר', body: 'טענו את העיצוב מחדש ונסו שוב.' }
  }
  if (code === 'FEASIBILITY_REQUIRED') {
    return en
      ? { title: 'Awaiting a feasibility review', body: 'The design can be published once its feasibility review is approved.' }
      : { title: 'ממתין לבדיקת היתכנות', body: 'ניתן יהיה לפרסם את העיצוב אחרי שבדיקת ההיתכנות תאושר.' }
  }
  if (action === 'publish' && err instanceof ApiError && err.status === 400) {
    return {
      title: en ? 'Cannot publish: the specification is incomplete' : 'לא ניתן לפרסם: המפרט אינו שלם',
      body: parseApiError(err),
    }
  }
  return {
    title: en
      ? { publish: 'Could not publish', save: 'Could not save', delete: 'Could not delete' }[action]
      : { publish: 'הפרסום נכשל', save: 'השמירה נכשלה', delete: 'המחיקה נכשלה' }[action],
    body: parseApiError(err),
  }
}

/** A design's name on screen: its title, else its item type ("שרשרת"), never a sample sentence. */
export function designDisplayTitle(
  design: { title?: string | null; itemType?: { code?: string; labelHe?: string | null; labelEn?: string | null } | null },
  locale: Locale,
): string {
  const title = design.title?.trim()
  if (title) return title
  const type = locale === 'en' ? design.itemType?.labelEn ?? design.itemType?.labelHe : design.itemType?.labelHe
  if (type) return type
  return locale === 'en' ? 'Untitled design' : 'עיצוב ללא שם'
}
