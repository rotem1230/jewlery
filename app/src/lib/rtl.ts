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
