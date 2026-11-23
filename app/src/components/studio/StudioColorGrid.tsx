import { Pressable, StyleSheet, Text, View } from 'react-native'
import { paletteColor } from '@/src/lib/jewelryCatalog.generated'
import { colors as theme } from '@/src/theme/tokens'

type StudioColorGridProps = {
  value: string
  onChange: (colorCode: string) => void
  /** The chart colours the stone comes in (its market colours: a diamond is white / clear only). */
  colors: readonly string[]
}

/**
 * The stone's colours from the client's chart: only those it comes in, no effects (the client's
 * notes of 23.11). A colour saved before that is no longer offered still shows by name.
 */
export function StudioColorGrid({ value, onChange, colors }: StudioColorGridProps) {
  const chosen = paletteColor(value)
  const swatches = colors.map((code) => paletteColor(code)).filter((color): color is NonNullable<typeof color> => color != null)

  return (
    <View style={styles.root}>
      <Text style={styles.name}>{chosen?.name ?? value}</Text>
      <View style={styles.grid}>
        {swatches.map((color) => {
          const selected = color.code === value
          return (
            <Pressable
              key={color.code}
              testID={`color-${color.code}`}
              onPress={() => onChange(color.code)}
              style={[styles.ring, selected && styles.ringOn]}
              accessibilityRole="button"
              accessibilityLabel={color.name}
              accessibilityState={{ selected }}
            >
              <View style={[styles.swatch, { backgroundColor: color.hex }]} />
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  name: { fontFamily: 'Heebo', fontSize: 13, color: theme.textSecondary, textAlign: 'right' },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  ring: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOn: { borderColor: theme.brand },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
})
