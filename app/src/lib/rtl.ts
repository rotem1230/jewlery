import type { TextStyle } from 'react-native'

/**
 * Physical text alignment for Hebrew-first UI.
 * Layout RTL is disabled in i18n so these map 1:1 to the screen edge.
 */
export const textAlignRight: NonNullable<TextStyle['textAlign']> = 'right'
export const textAlignLeft: NonNullable<TextStyle['textAlign']> = 'left'

/**
 * Direction of a row that follows reading order (e.g. the bottom navigation). Layout RTL is off,
 * so in Hebrew such a row is reversed by hand: its first item sits on the right edge.
 */
export function navRowDirection(locale: string): 'row' | 'row-reverse' {
  return locale === 'he' ? 'row-reverse' : 'row'
}

/** Unicode bidi isolates (UAX #9): left-to-right, first-strong, and their terminator. */
const LRI = String.fromCharCode(0x2066)
const FSI = String.fromCharCode(0x2068)
const PDI = String.fromCharCode(0x2069)

/**
 * An e-mail address, URL or other left-to-right token placed inside Hebrew text: isolated as one
 * left-to-right run, so its dots and "@" are not reordered against the sentence around it.
 */
export function ltrIsolate(text: string): string {
  return `${LRI}${text}${PDI}`
}

/**
 * A name, title or amount of either script placed inside Hebrew text: isolated (direction of its
 * own first letter) when it has Latin letters or digits; Hebrew text is left as it is.
 */
export function isolate(text: string): string {
  return /[A-Za-z0-9]/.test(text) ? `${FSI}${text}${PDI}` : text
}
