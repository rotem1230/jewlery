import { useCallback, useState } from 'react'
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CircleAlert } from 'lucide-react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { QuoteApproveSuccessModal } from '@/src/components/ui/QuoteApproveSuccessModal'
import { acceptQuote, declineQuote, getQuote } from '@/src/api/quotes'
import { createJewelryPaymentIntent, getJewelryPaymentIntent } from '@/src/api/jewelryPayments'
import { PaymentSheet } from '@/src/components/payments/PaymentSheet'
import { jewelryCheckoutStatus, waitForCheckout, type PaymentResult } from '@/src/lib/payments'
import { getFeatureFlags } from '@/src/api/visualization'
import { apiErrorCode, parseApiError } from '@/src/lib/api'
import { contentBodyText, currencySymbol, displayName, formatMoney } from '@/src/lib/format'
import { designPicture } from '@/src/lib/designPicture'
import { isolate } from '@/src/lib/rtl'
import { quoteTechRows, type QuoteTechRow } from '@/src/lib/quoteView'
import { canAcceptQuote, effectiveQuoteStatus, quoteAcceptErrorMessage, quoteStatusLabel } from '@/src/lib/quoteStatus'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, spacing } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { ChatsStackParamList } from '@/src/navigation/types'

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'QuoteDetails'>
type Route = RouteProp<ChatsStackParamList, 'QuoteDetails'>

type TechRow = { label: string; value: string }

export function QuoteDetailsScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const insets = useSafeAreaInsets()
  const userId = useAppSelector((s) => s.auth.user?.id)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [successVisible, setSuccessVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [jewelryPayment, setJewelryPayment] = useState<{ url: string; intentId: string } | null>(null)

  const load = useCallback(
    (signal: AbortSignal) => getQuote(route.params.quoteId, signal),
    [route.params.quoteId],
  )
  const { data: quote, loading, error, retry, refresh } = useAsyncData(load, {
    deps: [accessToken, route.params.quoteId],
  })
  // In-app payment is offered only while its feature is on (phase3_jewelry_pay); flags that cannot
  // be loaded count as off.
  const { data: flags } = useAsyncData(
    (signal) => getFeatureFlags(signal).catch((): Record<string, boolean> => ({})),
    { deps: [accessToken] },
  )

  // Expired, withdrawn or declined quotes show their status and offer no accept.
  const canAccept = quote ? canAcceptQuote(quote, userId) : false
  const statusLabel = quote ? quoteStatusLabel(effectiveQuoteStatus(quote), locale) : ''
  const canPayInApp =
    flags?.phase3_jewelry_pay === true && quote?.status === 'ACCEPTED' && quote.authorUserId !== userId
  const notes = quote?.notes?.trim()
  const picture = designPicture(quote?.design)

  const techLabel: Record<QuoteTechRow['key'], string> = {
    type: t('quoteTechTypeLabel'),
    material: t('quoteTechMaterialLabel'),
    materials: t('quoteTechMaterialsCostLabel'),
    labor: t('quoteTechLaborLabel'),
    date: t('quoteTechDateLabel'),
  }
  const techRows: TechRow[] = quote
    ? quoteTechRows(quote, locale === 'en' ? 'en' : 'he').map((row) => ({ label: techLabel[row.key], value: row.value }))
    : []
  const symbol = currencySymbol(quote?.currency)
  const jewelerName =
    quote?.author?.businessName ?? displayName(quote?.author?.firstName, quote?.author?.lastName, t('quoteJewelerFallback'))
  // Names and amounts in Latin letters or digits keep their place in the Hebrew sentence.
  const successMessage = t('quoteSuccessMessage')
    .replace('{jeweler}', isolate(jewelerName))
    .replace('{design}', isolate(quote?.design?.title ?? quote?.design?.itemType?.labelHe ?? ''))
    .replace('{total}', isolate(formatMoney(quote?.totalPrice, symbol)))

  const onAccept = async () => {
    if (!quote) return
    setBusy(true)
    try {
      // Accept exactly the terms on screen; a quote edited meanwhile is refused, never accepted unseen.
      await acceptQuote(quote)
      await refresh()
      setSuccessVisible(true)
    } catch (err) {
      const code = apiErrorCode(err)
      if (code === 'QUOTE_CHANGED') {
        await refresh()
        Alert.alert(t('quoteChangedTitle'), t('quoteChangedBody'))
        return
      }
      // The design changed since pricing, the quote or the listing expired, or it is no longer open.
      const refusal = quoteAcceptErrorMessage(code, locale)
      if (refusal) {
        await refresh()
        Alert.alert(refusal.title, refusal.body)
        return
      }
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onDecline = async () => {
    if (!quote) return
    setBusy(true)
    try {
      await declineQuote(quote.id)
      await refresh()
      navigation.navigate('ChatThread', { chatId: route.params.chatId })
    } catch (err) {
      const refusal = quoteAcceptErrorMessage(apiErrorCode(err), locale)
      if (refusal) {
        await refresh()
        Alert.alert(refusal.title, refusal.body)
        return
      }
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onPayInApp = async () => {
    if (!quote) return
    setBusy(true)
    try {
      const intent = await createJewelryPaymentIntent({ quoteId: quote.id })
      if (intent.paymentUrl) {
        // The card payment page opens inside the app; the result is confirmed by the server.
        setJewelryPayment({ url: intent.paymentUrl, intentId: intent.id })
        return
      }
      Alert.alert(t('quotePayInApp'), t('quotePayInAppDone'))
      setBusy(false)
    } catch (err) {
      setBusy(false)
      const code = apiErrorCode(err)
      if (code === 'PAYMENT_PROVIDER_NOT_CONFIGURED' || code === 'PAYMENT_PROVIDER_UNAVAILABLE') {
        Alert.alert(t('quotePayInApp'), t('paymentsUnavailable'))
        return
      }
      if (code === 'QUOTE_ALREADY_PAID') {
        Alert.alert(t('quotePayInApp'), t('quoteAlreadyPaid'))
        return
      }
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    }
  }

  /** Back from the card payment page: the payment counts once the server has confirmed it. */
  const onJewelryPaymentDone = async (result: PaymentResult) => {
    const current = jewelryPayment
    setJewelryPayment(null)
    if (!current || result !== 'success') {
      setBusy(false)
      if (current) Alert.alert(t('quotePayInApp'), t('paymentNotCompleted'))
      return
    }
    try {
      const outcome = await waitForCheckout(current.intentId, {
        get: async (id) => ({ status: jewelryCheckoutStatus((await getJewelryPaymentIntent(id)).status) }),
      })
      Alert.alert(
        t('quotePayInApp'),
        outcome === 'COMPLETED' ? t('quotePaidInApp') : outcome === 'PENDING' ? t('paymentPending') : t('paymentNotCompleted'),
      )
    } finally {
      setBusy(false)
    }
  }

  const goToChat = () => {
    setSuccessVisible(false)
    navigation.navigate('ChatThread', {
      chatId: route.params.chatId,
      quoteApproved: true,
    })
  }

  const disclaimer = contentBodyText(quote?.disclaimerPage?.body, t('quoteImportantBody'))

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('quoteDetailsTitle')} onBack={() => navigation.goBack()} />

      {error && !quote && !loading ? (
        <View style={styles.scrollContent}>
          <ErrorState
            title={t('commonLoadingErrorTitle')}
            message={t('commonLoadingErrorMessage')}
            retryLabel={t('commonRetry')}
            onRetry={retry}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {quote ? <Image source={picture.source} style={styles.hero} resizeMode={picture.resizeMode} /> : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('quoteSummaryTitle')}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryValue}>{formatMoney(quote?.totalPrice, symbol)}</Text>
              <Text style={styles.summaryLabel}>{t('quoteSummaryTotalLabel')}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryValue}>
                {t('quoteSummaryDeliveryValue').replace(
                  /\d+/,
                  String(quote?.etaBusinessDays ?? ''),
                )}
              </Text>
              <Text style={styles.summaryLabel}>{t('quoteSummaryDeliveryLabel')}</Text>
            </View>
            {statusLabel ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryValue}>{statusLabel}</Text>
                <Text style={styles.summaryLabel}>{t('dzQuoteStatusTitle')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('quoteTechTitle')}</Text>
            {techRows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.techRow, index < techRows.length - 1 && styles.techRowBorder]}
              >
                <Text style={styles.techValue}>{row.value}</Text>
                <Text style={styles.techLabel}>{row.label}</Text>
              </View>
            ))}
          </View>

          {notes ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('quoteNotesTitle')}</Text>
              <Text style={styles.notes}>{notes}</Text>
            </View>
          ) : null}

          <View style={styles.important}>
            <View style={styles.importantHeader}>
              <Text style={styles.importantTitle}>{t('quoteImportantTitle')}</Text>
              <CircleAlert size={18} color={colors.brand} strokeWidth={2} />
            </View>
            <Text style={styles.importantBody}>{disclaimer}</Text>
          </View>

          {canAccept ? (
            <>
              <BrandButton
                label={t('quoteApproveCta')}
                variant="primary"
                flex={false}
                disabled={busy}
                onPress={() => void onAccept()}
              />
              <BrandButton
                label={t('quoteDeclineCta')}
                variant="outline"
                flex={false}
                disabled={busy}
                onPress={() => void onDecline()}
              />
            </>
          ) : null}

          {canPayInApp ? (
            <BrandButton
              label={t('quotePayInApp')}
              variant="primary"
              flex={false}
              disabled={busy}
              onPress={() => void onPayInApp()}
            />
          ) : null}
        </ScrollView>
      )}

      <QuoteApproveSuccessModal
        visible={successVisible}
        title={t('quoteSuccessTitle')}
        message={successMessage}
        detail={t('quoteSuccessDetail')}
        ctaLabel={t('quoteSuccessCta')}
        onCta={goToChat}
        onRequestClose={() => setSuccessVisible(false)}
      />
      <PaymentSheet url={jewelryPayment?.url ?? null} onDone={(result) => void onJewelryPaymentDone(result)} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.homeBg },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  hero: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: '#1B1B23',
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 4,
  },
  cardTitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  summaryRow: {
    width: '100%',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  summaryLabel: {
    flexShrink: 0,
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryValue: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'left',
  },
  techRow: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  techRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  techLabel: {
    flexShrink: 0,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  techValue: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'left',
  },
  notes: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingBottom: 8,
  },
  important: { width: '100%', gap: 8, paddingVertical: 4 },
  importantHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  importantTitle: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  importantBody: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
