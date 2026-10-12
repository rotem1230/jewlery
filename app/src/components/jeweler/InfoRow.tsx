import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/src/theme/tokens'

type InfoRowProps = {
  label: string
  value: string
  icon?: ReactNode
}

/** Reusable label/value row — right-aligned label, value (+ optional icon) on the left. */
export function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {icon}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  valueRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  value: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
