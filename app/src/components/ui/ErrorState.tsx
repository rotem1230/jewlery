import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/src/components/ui/Button'
import { colors } from '@/src/theme/tokens'

type ErrorStateProps = {
  title: string
  message?: string
  retryLabel: string
  onRetry: () => void
}

/** Reusable full-width load-failure block with a retry action. */
export function ErrorState({ title, message, retryLabel, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.root} testID="error-state">
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Button variant="outline" onPress={onRetry}>
        {retryLabel}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  message: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
