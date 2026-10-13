import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/src/theme/tokens'

type BusinessInfoCardProps = {
  hoursTitle: string
  /** Open days only, e.g. { label: 'ראשון', text: '09:00–18:00' }. */
  hours: Array<{ label: string; text: string }>
  areaTitle: string
  area: string | null | undefined
}

/** A business profile's opening hours and service area; nothing when neither was filled in. */
export function BusinessInfoCard({ hoursTitle, hours, areaTitle, area }: BusinessInfoCardProps) {
  const areaText = area?.trim()
  if (hours.length === 0 && !areaText) return null
  return (
    <View style={styles.card}>
      {areaText ? (
        <View style={styles.section}>
          <Text style={styles.title}>{areaTitle}</Text>
          <Text style={styles.text}>{areaText}</Text>
        </View>
      ) : null}
      {hours.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.title}>{hoursTitle}</Text>
          {hours.map((row) => (
            <View key={row.label} style={styles.hourRow}>
              <Text style={styles.text}>{row.label}</Text>
              <Text style={styles.hours}>{row.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  section: {
    width: '100%',
    gap: 6,
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  text: {
    fontFamily: 'Heebo',
    fontSize: 14,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  hourRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  hours: {
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
  },
})
