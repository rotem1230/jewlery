import { useCallback, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { ClientInfoCard } from '@/src/components/jeweler/ClientInfoCard'
import { DesignSummaryCard } from '@/src/components/jeweler/DesignSummaryCard'
import { PriceOfferCard } from '@/src/components/jeweler/PriceOfferCard'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { getAtelierRequest } from '@/src/api/atelier'
import { getPublicUser } from '@/src/api/auth'
import { createConversation } from '@/src/api/chat'
import { declineMyOrder } from '@/src/api/jewelerProfiles'
import { withdrawQuote } from '@/src/api/quotes'
import { parseApiError } from '@/src/lib/api'
import { listingExpiry } from '@/src/lib/atelierView'
import { currencySymbol, displayName, formatMoney, imageFromUpload } from '@/src/lib/format'
import { jewelerErrorKey, shouldReload, type JewelerAction } from '@/src/lib/jewelerErrors'
import { designSpecRows, orderActions, orderBadge } from '@/src/lib/jewelerOrders'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation } from '@/src/i18n'
import type { JewelerTabParamList, MyOrdersStackParamList } from '@/src/navigation/types'
import heroRing from '../../../assets/images/home/hero-ring.png'

type Nav = NativeStackNavigationProp<MyOrdersStackParamList, 'OrderDetails'>
type Route = RouteProp<MyOrdersStackParamList, 'OrderDetails'>
type TabNav = BottomTabNavigationProp<JewelerTabParamList>

/**
 * One work request (PRD 8): the client's name (their phone is not shown before a quote is
 * accepted — decision D1), the full design specification, the jeweler's quote, and the actions:
 * quote / edit / withdraw, chat, or decline the request.
 */
export function OrderDetailsScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const route = useRoute<Route>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (signal: AbortSignal) => {
      const request = await getAtelierRequest(route.params.orderId, signal)
      const requester = await getPublicUser(request.requesterId, signal).catch(() => null)
      return { request, requester }
    },
    [route.params.orderId],
  )
  const { data, loading, error, retry } = useAsyncData(load, {
    deps: [accessToken, route.params.orderId],
  })

  const request = data?.request
  const requester = data?.requester
  const actions = useMemo(() => (request ? orderActions(request) : null), [request])
  const quote = actions?.quote ?? null

  const specs = useMemo(() => {
    const rows = designSpecRows(request?.design)
    if (request?.message?.trim()) {
      rows.push({ label: t('jwRequestMessage'), value: request.message.trim(), fullWidth: true })
    }
    return rows
  }, [request, t])

  const details = useMemo(() => {
    const lines: string[] = []
    const badge = orderBadge(actions?.status)
    if (badge) lines.push(`${t('jwStatusLabel')} ${t(badge.labelKey)}`)
    const expiry = listingExpiry(request?.design?.expiresAt, locale)
    if (expiry) lines.push(t(expiry.expired ? 'jwExpiredOn' : 'jwValidUntil').replace('{{date}}', expiry.date))
    return lines
  }, [actions, request, locale, t])

  const showError = (err: unknown, action: JewelerAction) => {
    const key = jewelerErrorKey(err, action)
    Alert.alert(t('authErrorTitle'), key ? t(key) : parseApiError(err))
    if (shouldReload(err)) retry()
  }

  const openChat = async () => {
    if (!request) return
    setBusy(true)
    try {
      const conv = await createConversation(request.designId, [request.requesterId])
      tabNavigation.navigate('Chats', {
        screen: 'ChatThread',
        params: { chatId: conv.id, title: displayName(requester?.firstName, requester?.lastName) },
      })
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const openQuoteForm = (quoteId?: string) => {
    if (!request) return
    tabNavigation.navigate('Atelier', {
      screen: 'SubmitQuote',
      params: {
        designId: request.designId,
        requestId: request.id,
        quoteId,
        conversationId: quoteId ? quote?.conversationId : undefined,
      },
    })
  }

  const decline = async () => {
    if (!request) return
    setBusy(true)
    try {
      await declineMyOrder(request.id)
      // The board reloads when it regains focus.
      navigation.goBack()
    } catch (err) {
      showError(err, 'decline')
    } finally {
      setBusy(false)
    }
  }

  const confirmDecline = () =>
    Alert.alert(t('jwDeclineConfirmTitle'), t('jwDeclineConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('jwDeclineConfirmCta'), style: 'destructive', onPress: () => decline() },
    ])

  const withdraw = async () => {
    if (!quote) return
    setBusy(true)
    try {
      await withdrawQuote(quote.id)
      Alert.alert(t('jwWithdrawDone'))
      retry()
    } catch (err) {
      showError(err, 'withdraw')
    } finally {
      setBusy(false)
    }
  }

  const confirmWithdraw = () =>
    Alert.alert(t('jwWithdrawConfirmTitle'), t('jwWithdrawConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('jwWithdrawCta'), style: 'destructive', onPress: () => withdraw() },
    ])

  const dateLabel = request
    ? new Date(request.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB')
    : ''
  const itemType = request?.design?.itemType

  return (
    <View style={styles.root}>
      <HomeHeader onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {error && !request && !loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : request && actions ? (
            <>
              <ClientInfoCard
                title={t('jewelerOrderDetailClientTitle')}
                nameLabel={t('jewelerOrderDetailClientNameLabel')}
                name={displayName(requester?.firstName, requester?.lastName, t('designer'))}
                dateLabel={t('jewelerOrderDetailClientDateLabel')}
                date={dateLabel}
              />

              <DesignSummaryCard
                sectionTitle={t('jewelerOrderDetailDesignTitle')}
                image={imageFromUpload(request.design?.thumbnailUploadId, heroRing)}
                title={request.design?.title || itemType?.labelHe || t('jwUntitledDesign')}
                details={details}
                quote={request.design?.description ?? ''}
                specs={specs}
              />

              {quote ? (
                <PriceOfferCard
                  title={t('jewelerOrderDetailPriceTitle')}
                  totalLabel={t('jewelerOrderDetailPriceTotalLabel')}
                  amount={formatMoney(quote.totalPrice, '').trim()}
                  currencySymbol={currencySymbol(quote.currency)}
                />
              ) : null}

              <View style={styles.actions}>
                {actions.canEditQuote && quote ? (
                  <BrandButton
                    label={t('jewelerOrderDetailEditOffer')}
                    variant="primary"
                    flex={false}
                    disabled={busy}
                    onPress={() => openQuoteForm(quote.id)}
                  />
                ) : null}
                {actions.canSubmitQuote ? (
                  <BrandButton
                    label={t('jwSubmitOffer')}
                    variant="primary"
                    flex={false}
                    disabled={busy}
                    onPress={() => openQuoteForm()}
                  />
                ) : null}
                <BrandButton
                  label={t('jewelerOrderDetailGoToChat')}
                  variant="outline"
                  flex={false}
                  disabled={busy}
                  onPress={() => void openChat()}
                />
                {actions.canWithdrawQuote ? (
                  <BrandButton
                    label={t('jwWithdrawCta')}
                    variant="outline"
                    flex={false}
                    disabled={busy}
                    onPress={confirmWithdraw}
                  />
                ) : null}
                {actions.canDecline ? (
                  <BrandButton
                    label={t('jwDeclineCta')}
                    variant="outline"
                    flex={false}
                    disabled={busy}
                    onPress={confirmDecline}
                  />
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDF3FA',
  },
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  column: {
    width: '100%',
    maxWidth: 343,
    gap: 20,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
})
