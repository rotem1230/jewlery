import type { TextStyle } from 'react-native'

/**
 * Physical text alignment for Hebrew-first UI.
 * Layout RTL is disabled in i18n so these map 1:1 to the screen edge.
 */
export const textAlignRight: NonNullable<TextStyle['textAlign']> = 'right'
export const textAlignLeft: NonNullable<TextStyle['textAlign']> = 'left'
