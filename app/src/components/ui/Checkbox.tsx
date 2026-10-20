import type { ReactNode } from 'react'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { Check } from 'lucide-react-native'
import { cn } from '@/src/lib/cn'
import { colors, radii } from '@/src/theme/tokens'

type CheckboxProps = {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  labelNode?: ReactNode
  className?: string
  testID?: string
}

/** Figma: justify flex-end, gap 8 — checkbox on the visual right of the label */
export function Checkbox({ checked, onChange, label, labelNode, className, testID }: CheckboxProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      className={cn('w-full', className)}
      style={styles.row}
    >
      {labelNode ? (
        labelNode
      ) : label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
      <View style={[styles.box, checked ? styles.boxChecked : null]}>
        {checked ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    // Keep visual order stable even if app RTL is on
    direction: 'ltr',
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.navy,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.brand,
  },
})
