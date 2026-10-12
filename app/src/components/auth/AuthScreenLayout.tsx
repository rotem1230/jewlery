import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuthCurvedHeader } from '@/src/components/auth/AuthCurvedHeader'
import { colors, spacing } from '@/src/theme/tokens'

type AuthScreenLayoutProps = {
  top: ReactNode
  bottom: ReactNode
  /**
   * `spread` — Figma login/signup: form top, actions pinned to bottom (justify-between).
   * `stack` — Figma forgot password: actions sit under the form with a fixed gap.
   */
  layout?: 'spread' | 'stack'
}

/**
 * Figma auth shell (#EDF3FA body, white arched header + logo, 24×32 page padding).
 */
export function AuthScreenLayout({ top, bottom, layout = 'spread' }: AuthScreenLayoutProps) {
  const insets = useSafeAreaInsets()
  const isSpread = layout === 'spread'

  return (
    <View style={styles.root}>
      <AuthCurvedHeader />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            isSpread ? styles.contentSpread : styles.contentStack,
            { paddingBottom: Math.max(insets.bottom, spacing.xxxl) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.top}>{top}</View>
          <View style={styles.bottom}>{bottom}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.authBg,
  },
  flex: {
    flex: 1,
  },
  content: {
    width: '100%',
    flexGrow: 1,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.xxxl,
    gap: spacing.xxxl,
  },
  contentSpread: {
    justifyContent: 'space-between',
  },
  contentStack: {
    justifyContent: 'flex-start',
  },
  top: {
    width: '100%',
    gap: spacing.xxxl,
  },
  bottom: {
    width: '100%',
    gap: spacing.actionGap,
  },
})
