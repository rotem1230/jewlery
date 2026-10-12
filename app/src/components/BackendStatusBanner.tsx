import { Text, View, StyleSheet } from 'react-native'
import { useBackendHealth } from '@/src/hooks/useBackendHealth'
import { colors } from '@/src/theme/tokens'

const DOT: Record<string, string> = {
  checking: '#C9A227',
  online: '#1F9D55',
  offline: '#D64545',
}

const LABEL: Record<string, string> = {
  checking: 'Connecting to backend…',
  online: 'Backend connected',
  offline: 'Backend offline',
}

/** Small dev banner showing local backend connectivity. Non-blocking. */
export function BackendStatusBanner() {
  const { status, baseUrl } = useBackendHealth()
  return (
    <View style={styles.wrap} testID="backend-status">
      <View style={[styles.dot, { backgroundColor: DOT[status] }]} />
      <Text style={styles.text}>
        {LABEL[status]} · {baseUrl}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontFamily: 'Heebo',
    fontSize: 12,
    color: colors.ink,
    opacity: 0.7,
  },
})
