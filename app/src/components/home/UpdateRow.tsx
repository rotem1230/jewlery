import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'

type UpdateRowProps = {
  title: string
  subtitle: string
  onPress?: () => void
  showDivider?: boolean
}

/**
 * Title row = chevron + title on one line (vertically centered together).
 * Subtitle under title. Border, then explicit space below the border.
 */
export function UpdateRow({ title, subtitle, onPress, showDivider = true }: UpdateRowProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.titleRow}>
          <View style={styles.chevron}>
            <ChevronLeft size={20} color="#3C3F44" strokeWidth={2.25} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </Pressable>

      {showDivider ? (
        <>
          <View style={styles.divider} />
          <View style={styles.spaceBelowBorder} />
        </>
      ) : null}
    </View>
  )
}

const androidFont = Platform.OS === 'android' ? { includeFontPadding: false as const } : null

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  row: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#BBBFC3',
  },
  /** Hard space after the border line (margin was collapsing / hard to see). */
  spaceBelowBorder: {
    width: '100%',
    height: 16,
  },
  pressed: {
    opacity: 0.8,
  },
  titleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 32,
  },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D6D9DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  title: {
    ...androidFont,
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: '#3C3F44',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    ...androidFont,
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: '#767686',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
