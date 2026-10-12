import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/src/theme/tokens'

export type StudioChipItem = {
  id: string
  label: string
  selected?: boolean
  swatch?: string
}

type StudioChipsProps = {
  items: StudioChipItem[]
  onSelect: (id: string) => void
  disabled?: boolean
  wrap?: boolean
}

export function StudioChips({ items, onSelect, disabled, wrap = false }: StudioChipsProps) {
  const row = (
    <>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onSelect(item.id)}
          disabled={disabled}
          style={[styles.chip, item.selected && styles.chipOn, disabled && styles.chipOff]}
        >
          {item.swatch ? <View style={[styles.swatch, { backgroundColor: item.swatch }]} /> : null}
          <Text style={[styles.label, item.selected && styles.labelOn]}>{item.label}</Text>
        </Pressable>
      ))}
    </>
  )
  if (wrap) return <View style={styles.wrapRow}>{row}</View>
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {row}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingVertical: 4,
  },
  wrapRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.brand,
    backgroundColor: '#EFECF8',
  },
  chipOff: {
    opacity: 0.45,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.ink,
  },
  labelOn: {
    color: colors.brand,
    fontWeight: '600',
  },
})
