import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import WebView from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { paymentReturn, type PaymentResult } from '@/src/lib/payments'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'

/**
 * The Cardcom payment page inside the app. It closes itself on the server's return page (with its
 * result) and never loads that page; closing it by hand counts as cancelled.
 */
export function PaymentSheet({ url, onDone }: { url: string | null; onDone: (result: PaymentResult) => void }) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  const intercept = (target: string): boolean => {
    const result = paymentReturn(target)
    if (result) {
      onDone(result)
      return false
    }
    return true
  }

  return (
    <Modal visible={Boolean(url)} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => onDone('cancel')}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('cancel')} hitSlop={12} onPress={() => onDone('cancel')}>
            <X size={24} color={colors.ink} strokeWidth={1.5} />
          </Pressable>
          <Text style={styles.title}>{t('paymentSheetTitle')}</Text>
        </View>
        {url ? (
          <WebView
            source={{ uri: url }}
            style={styles.web}
            startInLoadingState
            renderLoading={() => <ActivityIndicator style={styles.loading} color={colors.brand} />}
            onShouldStartLoadWithRequest={(request) => intercept(request.url)}
            onNavigationStateChange={(state) => {
              // Android may report a redirect only here.
              if (paymentReturn(state.url)) intercept(state.url)
            }}
            setSupportMultipleWindows={false}
          />
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  web: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 32,
    alignSelf: 'center',
  },
})
