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
import { parseApiError } from '@/src/lib/api'
import { displayName, formatMoney, imageFromUpload } from '@/src/lib/format'
import { specsFromParameters } from '@/src/lib/designSpecs'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation } from '@/src/i18n'
import type { JewelerTabParamList, MyOrdersStackParamList } from '@/src/navigation/types'
import heroRing from '../../../assets/images/home/hero-ring.png'

type Nav = NativeStackNavigationProp<MyOrdersStackParamList, 'OrderDetails'>
type Route = RouteProp<MyOrdersStackParamList, 'OrderDetails'>
type TabNav = BottomTabNavigationProp<JewelerTabParamList>

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
  const quote = request?.quotes?.[0]
  const specs = useMemo(
    () => specsFromParameters(request?.design?.parameters, request?.design?.itemType?.labelHe),
    [request],
  )

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

  const dateLabel = request
    ? new Date(request.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB')
    : ''

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
          ) : request ? (
            <>
              <ClientInfoCard
                title={t('jewelerOrderDetailClientTitle')}
                nameLabel={t('jewelerOrderDetailClientNameLabel')}
                name={displayName(requester?.firstName, requester?.lastName, t('designer'))}
                phoneLabel={t('jewelerOrderDetailClientPhoneLabel')}
                phone={requester?.email ?? '—'}
                dateLabel={t('jewelerOrderDetailClientDateLabel')}
                date={dateLabel}
              />

              <DesignSummaryCard
                sectionTitle={t('jewelerOrderDetailDesignTitle')}
                image={imageFromUpload(request.design?.thumbnailUploadId, heroRing)}
                title={request.design?.title || t('jewelerOrderDetailDesignHeadline')}
                quote={request.design?.description || request.message || ''}
                specs={specs}
              />

              {quote ? (
                <PriceOfferCard
                  title={t('jewelerOrderDetailPriceTitle')}
                  totalLabel={t('jewelerOrderDetailPriceTotalLabel')}
                  amount={formatMoney(quote.totalPrice).replace('₪ ', '')}
                  currencySymbol="₪"
                />
              ) : null}

              <View style={styles.actions}>
                <BrandButton
                  label={t('jewelerOrderDetailEditOffer')}
                  variant="primary"
                  flex={false}
                  onPress={() =>
                    tabNavigation.navigate('Atelier', {
                      screen: 'SubmitQuote',
                      params: {
                        designId: request.designId,
                        requestId: request.id,
                        quoteId: quote?.id,
                        conversationId: quote?.conversationId,
                      },
                    })
                  }
                />
                <BrandButton
                  label={t('jewelerOrderDetailGoToChat')}
                  variant="outline"
                  flex={false}
                  disabled={busy}
                  onPress={() => void openChat()}
                />
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
