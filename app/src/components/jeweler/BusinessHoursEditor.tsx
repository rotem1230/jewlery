import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Check } from 'lucide-react-native'
import type { DayHours } from '@/src/lib/businessHours'
import { colors, radii } from '@/src/theme/tokens'

type BusinessHoursEditorProps = {
  rows: DayHours[]
  dayLabel: (day: number) => string
  openLabel: string
  closeLabel: string
  /** Per weekday, already translated. */
  errors: Partial<Record<number, string>>
  onChange: (rows: DayHours[]) => void
}

/** Business hours in the profile form: one row per weekday — open or closed, and its times (HH:MM). */
export function BusinessHoursEditor({
  rows,
  dayLabel,
  openLabel,
  closeLabel,
  errors,
  onChange,
}: BusinessHoursEditorProps) {
  const update = (day: number, next: Partial<DayHours>) =>
    onChange(rows.map((row) => (row.day === day ? { ...row, ...next } : row)))

  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.day} style={styles.item}>
          <View style={styles.row}>
            <Pressable
              onPress={() => update(row.day, { open: !row.open })}
              style={styles.dayToggle}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.open }}
            >
              <View style={[styles.box, row.open ? styles.boxChecked : null]}>
                {row.open ? <Check size={12} color={colors.textInverse} strokeWidth={3} /> : null}
              </View>
              <Text style={styles.day}>{dayLabel(row.day)}</Text>
            </Pressable>
            {row.open ? (
              <View style={styles.times}>
                <TextInput
                  value={row.from}
                  onChangeText={(from) => update(row.day, { from })}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.formPlaceholder}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  accessibilityLabel={`${dayLabel(row.day)} ${openLabel}`}
                  style={[styles.time, errors[row.day] ? styles.timeError : null]}
                  textAlign="center"
                />
                <Text style={styles.dash}>–</Text>
                <TextInput
                  value={row.to}
                  onChangeText={(to) => update(row.day, { to })}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.formPlaceholder}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  accessibilityLabel={`${dayLabel(row.day)} ${closeLabel}`}
                  style={[styles.time, errors[row.day] ? styles.timeError : null]}
                  textAlign="center"
                />
              </View>
            ) : null}
          </View>
          {errors[row.day] ? <Text style={styles.error}>{errors[row.day]}</Text> : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    gap: 8,
  },
  item: {
    width: '100%',
    gap: 4,
  },
  row: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayToggle: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.formBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  day: {
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  times: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  time: {
    width: 72,
    minHeight: 36,
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: 6,
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
  },
  timeError: {
    borderColor: '#F04438',
  },
  dash: {
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.textSecondary,
  },
  error: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    color: '#F04438',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
