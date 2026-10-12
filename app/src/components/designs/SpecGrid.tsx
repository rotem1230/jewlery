import { StyleSheet, Text, View } from 'react-native'
import { radii } from '@/src/theme/tokens'

type SpecCellProps = {
  label: string
  value: string
  fullWidth?: boolean
}

/** Figma spec tile — #F8F8F6, soft violet border, centered label/value. */
export function SpecCell({ label, value, fullWidth }: SpecCellProps) {
  return (
    <View style={[styles.cell, fullWidth ? styles.full : styles.half]}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.value} numberOfLines={fullWidth ? 3 : 2}>
        {value}
      </Text>
    </View>
  )
}

type SpecPair = { label: string; value: string; fullWidth?: boolean }

type SpecGridProps = {
  items: SpecPair[]
}

/** Responsive 2-column grid (row-reverse for Hebrew reading order). */
export function SpecGrid({ items }: SpecGridProps) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <SpecCell
          key={`${item.label}-${item.value}`}
          label={item.label}
          value={item.value}
          fullWidth={item.fullWidth}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    backgroundColor: '#F8F8F6',
    borderWidth: 1,
    borderColor: 'rgba(109, 40, 217, 0.1)',
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 65,
  },
  half: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '47%',
    maxWidth: '48.5%',
  },
  full: {
    flexBasis: '100%',
    maxWidth: '100%',
    width: '100%',
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: '#64748B',
    textAlign: 'center',
  },
  value: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    color: '#1E293B',
    textAlign: 'center',
  },
})
