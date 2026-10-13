import { StyleSheet, Text, View } from 'react-native'
import { Phone } from 'lucide-react-native'
import { InfoRow } from '@/src/components/jeweler/InfoRow'
import { colors, radii } from '@/src/theme/tokens'

type ClientInfoCardProps = {
  title: string
  nameLabel: string
  name: string
  /**
   * Product decision D1: the customer's phone is not shown before a quote is accepted (the contact
   * then goes through the WhatsApp link in the chat), so the phone row is optional.
   */
  phoneLabel?: string
  phone?: string
  dateLabel: string
  date: string
}

/** Figma "פרטי לקוח" card — title + label/value rows. */
export function ClientInfoCard({
  title,
  nameLabel,
  name,
  phoneLabel,
  phone,
  dateLabel,
  date,
}: ClientInfoCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rows}>
        <InfoRow label={nameLabel} value={name} />
        {phoneLabel && phone ? (
          <InfoRow
            label={phoneLabel}
            value={phone}
            icon={<Phone size={14} color={colors.brand} strokeWidth={2} />}
          />
        ) : null}
        {date ? <InfoRow label={dateLabel} value={date} /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
    gap: 16,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rows: {
    width: '100%',
    gap: 14,
  },
})
