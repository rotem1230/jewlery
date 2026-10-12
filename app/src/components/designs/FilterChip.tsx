import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii } from '@/src/theme/tokens'

type FilterChipProps = {
  label: string
  count?: number
  selected?: boolean
  onPress?: () => void
}

/** Figma filter badge — pill, py 4 / px 12, selected = brand fill. */
export function FilterChip({ label, count, selected, onPress }: FilterChipProps) {
  const text = count != null ? `${label} (${count})` : label

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <View style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}>
        <Text style={[styles.label, selected ? styles.labelSelected : styles.labelIdle]}>
          {text}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 4,
  },
  chipIdle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chipSelected: {
    backgroundColor: colors.brand,
    borderWidth: 0,
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 13,
    letterSpacing: -0.12,
    textAlign: 'center',
  },
  labelIdle: {
    color: colors.ink,
  },
  labelSelected: {
    color: colors.textInverse,
  },
})
