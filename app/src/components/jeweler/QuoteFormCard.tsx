import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { colors, radii } from '@/src/theme/tokens'

const DELIVERY_OPTIONS_DAYS = [7, 14, 21, 30]

export type QuoteFormValues = {
  materialsCost: string
  laborCost: string
  hoursWorked: string
  deliveryDays: number
}

type QuoteFormCardProps = {
  title: string
  materialsCostLabel: string
  laborCostLabel: string
  hoursWorkedLabel: string
  deliveryTimeLabel: string
  deliveryDaysUnit: (days: number) => string
  totalLabel: string
  currencySymbol: string
  initialValues?: QuoteFormValues
  errors?: { materialsCost?: string; laborCost?: string; hoursWorked?: string }
  onChange?: (values: QuoteFormValues) => void
}

/** Figma "הגשת הצעת מחיר" — editable materials/labor/hours/delivery quote form. */
export function QuoteFormCard({
  title,
  materialsCostLabel,
  laborCostLabel,
  hoursWorkedLabel,
  deliveryTimeLabel,
  deliveryDaysUnit,
  totalLabel,
  currencySymbol,
  initialValues,
  errors,
  onChange,
}: QuoteFormCardProps) {
  const [materialsCost, setMaterialsCost] = useState(initialValues?.materialsCost ?? '')
  const [laborCost, setLaborCost] = useState(initialValues?.laborCost ?? '')
  const [hoursWorked, setHoursWorked] = useState(initialValues?.hoursWorked ?? '')
  const [deliveryIndex, setDeliveryIndex] = useState(() => {
    const days = initialValues?.deliveryDays ?? 7
    const index = DELIVERY_OPTIONS_DAYS.indexOf(days)
    return index >= 0 ? index : 0
  })

  useEffect(() => {
    if (!initialValues) return
    setMaterialsCost(initialValues.materialsCost)
    setLaborCost(initialValues.laborCost)
    setHoursWorked(initialValues.hoursWorked)
    const index = DELIVERY_OPTIONS_DAYS.indexOf(initialValues.deliveryDays)
    if (index >= 0) setDeliveryIndex(index)
  }, [initialValues])

  const emit = (next: Partial<QuoteFormValues>) => {
    const values: QuoteFormValues = {
      materialsCost,
      laborCost,
      hoursWorked,
      deliveryDays: DELIVERY_OPTIONS_DAYS[deliveryIndex],
      ...next,
    }
    onChange?.(values)
  }

  const total = useMemo(() => {
    const materials = parseFloat(materialsCost.replace(',', '.'))
    const labor = parseFloat(laborCost.replace(',', '.'))
    return (Number.isFinite(materials) ? materials : 0) + (Number.isFinite(labor) ? labor : 0)
  }, [materialsCost, laborCost])

  const deliveryDays = DELIVERY_OPTIONS_DAYS[deliveryIndex]

  const cycleDelivery = () => {
    const nextIndex = (deliveryIndex + 1) % DELIVERY_OPTIONS_DAYS.length
    setDeliveryIndex(nextIndex)
    emit({ deliveryDays: DELIVERY_OPTIONS_DAYS[nextIndex] })
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
