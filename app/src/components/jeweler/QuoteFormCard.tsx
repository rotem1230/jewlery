import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { QUOTE_NOTES_MAX, deliveryOptions, type QuoteFormValues } from '@/src/lib/quoteForm'
import { colors, radii } from '@/src/theme/tokens'

export type { QuoteFormValues }

type QuoteFormCardProps = {
  title: string
  materialsCostLabel: string
  laborCostLabel: string
  hoursWorkedLabel: string
  deliveryTimeLabel: string
  deliveryDaysUnit: (days: number) => string
  notesLabel: string
  notesPlaceholder: string
  totalLabel: string
  currencySymbol: string
  initialValues?: QuoteFormValues
  errors?: { materialsCost?: string; laborCost?: string; hoursWorked?: string; notes?: string }
  onChange?: (values: QuoteFormValues) => void
}

/** Figma "הגשת הצעת מחיר" — editable materials/labor/hours/delivery/notes quote form. */
export function QuoteFormCard({
  title,
  materialsCostLabel,
  laborCostLabel,
  hoursWorkedLabel,
  deliveryTimeLabel,
  deliveryDaysUnit,
  notesLabel,
  notesPlaceholder,
  totalLabel,
  currencySymbol,
  initialValues,
  errors,
  onChange,
}: QuoteFormCardProps) {
  const [materialsCost, setMaterialsCost] = useState(initialValues?.materialsCost ?? '')
  const [laborCost, setLaborCost] = useState(initialValues?.laborCost ?? '')
  const [hoursWorked, setHoursWorked] = useState(initialValues?.hoursWorked ?? '')
  const [notes, setNotes] = useState(initialValues?.notes ?? '')
  // An existing quote's own delivery time stays a choice, so editing never changes it silently.
  const options = useMemo(() => deliveryOptions(initialValues?.deliveryDays), [initialValues?.deliveryDays])
  const [deliveryIndex, setDeliveryIndex] = useState(() =>
    Math.max(0, options.indexOf(initialValues?.deliveryDays ?? options[0])),
  )

  useEffect(() => {
    if (!initialValues) return
    setMaterialsCost(initialValues.materialsCost)
    setLaborCost(initialValues.laborCost)
    setHoursWorked(initialValues.hoursWorked)
    setNotes(initialValues.notes)
    setDeliveryIndex(Math.max(0, deliveryOptions(initialValues.deliveryDays).indexOf(initialValues.deliveryDays)))
  }, [initialValues])

  const emit = (next: Partial<QuoteFormValues>) => {
    const values: QuoteFormValues = {
      materialsCost,
      laborCost,
      hoursWorked,
      deliveryDays: options[deliveryIndex],
      notes,
      ...next,
    }
    onChange?.(values)
  }

  const total = useMemo(() => {
    const materials = parseFloat(materialsCost.replace(',', '.'))
    const labor = parseFloat(laborCost.replace(',', '.'))
    return (Number.isFinite(materials) ? materials : 0) + (Number.isFinite(labor) ? labor : 0)
  }, [materialsCost, laborCost])

  const deliveryDays = options[deliveryIndex]

  const cycleDelivery = () => {
    const nextIndex = (deliveryIndex + 1) % options.length
    setDeliveryIndex(nextIndex)
    emit({ deliveryDays: options[nextIndex] })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.row}>
        <MoneyField
          label={materialsCostLabel}
          value={materialsCost}
          error={errors?.materialsCost}
          currencySymbol={currencySymbol}
          onChangeText={(next) => {
            setMaterialsCost(next)
            emit({ materialsCost: next })
          }}
        />
        <MoneyField
          label={laborCostLabel}
          value={laborCost}
          error={errors?.laborCost}
          currencySymbol={currencySymbol}
          onChangeText={(next) => {
            setLaborCost(next)
            emit({ laborCost: next })
          }}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>{hoursWorkedLabel}</Text>
          <View style={[styles.inputBox, errors?.hoursWorked ? styles.inputError : null]}>
            <TextInput
              value={hoursWorked}
              onChangeText={(next) => {
                setHoursWorked(next)
                emit({ hoursWorked: next })
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              textAlign="center"
            />
          </View>
          {errors?.hoursWorked ? <Text style={styles.error}>{errors.hoursWorked}</Text> : null}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{deliveryTimeLabel}</Text>
          <TouchableOpacity style={styles.deliveryBox} onPress={cycleDelivery} activeOpacity={0.8}>
            <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.deliveryValue}>{deliveryDaysUnit(deliveryDays)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.notesField}>
        <Text style={styles.label}>{notesLabel}</Text>
        <TextInput
          value={notes}
          onChangeText={(next) => {
            setNotes(next)
            emit({ notes: next })
          }}
          placeholder={notesPlaceholder}
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={QUOTE_NOTES_MAX}
          textAlign="right"
          style={[styles.notesInput, errors?.notes ? styles.inputError : null]}
        />
        {errors?.notes ? <Text style={styles.error}>{errors.notes}</Text> : null}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <View style={styles.totalBox}>
          <Text style={styles.totalValue}>
            {total.toFixed(2)} {currencySymbol}
          </Text>
        </View>
      </View>
    </View>
  )
}

function MoneyField({
  label,
  value,
  error,
  currencySymbol,
  onChangeText,
}: {
  label: string
  value: string
  error?: string
  currencySymbol: string
  onChangeText: (value: string) => void
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputBox, error ? styles.inputError : null]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={`0.00 ${currencySymbol}`}
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          textAlign="center"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.lg,
    padding: 20,
    gap: 16,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  row: {
    width: '100%',
    flexDirection: 'row-reverse',
    gap: 12,
  },
  field: {
    flex: 1,
    gap: 6,
    alignItems: 'flex-end',
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputBox: {
    width: '100%',
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  inputError: {
    borderColor: '#F04438',
  },
  input: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
    paddingVertical: 10,
  },
  error: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    color: '#F04438',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notesField: {
    width: '100%',
    gap: 6,
    alignItems: 'flex-end',
  },
  notesInput: {
    width: '100%',
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
    writingDirection: 'rtl',
  },
  deliveryBox: {
    width: '100%',
    minHeight: 44,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
  },
  deliveryValue: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  totalRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  totalLabel: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  totalBox: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  totalValue: {
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
})
