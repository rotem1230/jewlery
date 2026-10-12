import { StyleSheet, Text, View } from 'react-native'
import { colors, radii } from '@/src/theme/tokens'

type PriceOfferCardProps = {
  title: string
  totalLabel: string
  amount: string
  currencySymbol: string
}

/** Figma "הצעת מחיר שהגשתי" — bordered card with a boxed total-price readout. */
export function PriceOfferCard({ title, totalLabel, amount, currencySymbol }: PriceOfferCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <View style={styles.amountBox}>
          <Text style={styles.currency}>{currencySymbol}</Text>
          <Text style={styles.amount}>{amount}</Text>
        </View>
      </View>
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
  totalRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  amountBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  currency: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  amount: {
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
})
