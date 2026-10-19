import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Check } from 'lucide-react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { Button } from '@/src/components/ui/Button'
import { ErrorState } from '@/src/components/ui/ErrorState'
import {
  listPlans,
  subscribeToPlan,
  cancelSubscription,
  getMySubscription,
  startCheckout,
  getCheckout,
} from '@/src/api/subscriptions'
import { PaymentSheet } from '@/src/components/payments/PaymentSheet'
import { apiErrorCode, parseApiError } from '@/src/lib/api'
import {
  checkoutErrorMessage,
  paymentUnavailableMessage,
  planAction,
  waitForCheckout,
  type PaymentResult,
} from '@/src/lib/payments'
import { planCards, subscribeErrorMessage } from '@/src/lib/plans'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'

const LIVE_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE']

/**
 * Figma pricing — the plans of the active role (designer or jeweler) as the server lists them
 * (`GET /subscriptions/plans`): their own names, exact prices with agorot, interval, trial and
 * what each includes. Loading, error and empty states; never sample plans.
 */
export function PricingScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation()
  const activeRole = useAppSelector((s) => s.auth.user?.activeRole)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const role = activeRole === 'JEWELER' ? 'JEWELER' : 'DESIGNER'
  const plansQuery = useAsyncData((signal) => listPlans(role, signal), { deps: [accessToken, role] })
  const subQuery = useAsyncData((signal) => getMySubscription(signal), { deps: [accessToken] })
  const [busy, setBusy] = useState(false)
  const [payment, setPayment] = useState<{ url: string; checkoutId: string } | null>(null)

  const subscription = subQuery.data
  const live = Boolean(subscription) && LIVE_STATUSES.includes(subscription?.status ?? '')
  const cards = planCards(plansQuery.data ?? [], {
    role,
    locale,
    currentPlanCode: live ? subscription?.plan?.code : null,
  })

  /** Opens the card payment page of a paid plan (Cardcom), inside the app. */
  const onPay = async (planCode: string) => {
    setBusy(true)
    try {
      const checkout = await startCheckout(planCode)
      if (!checkout.paymentUrl) {
        Alert.alert(t('authErrorTitle'), paymentUnavailableMessage(locale))
        setBusy(false)
        return
      }
      setPayment({ url: checkout.paymentUrl, checkoutId: checkout.id })
    } catch (err) {
      Alert.alert(t('authErrorTitle'), checkoutErrorMessage(err, locale))
      setBusy(false)
    }
  }

  /** Back from the payment page: the plan starts once the server has confirmed the payment. */
  const onPaymentDone = async (result: PaymentResult) => {
    const current = payment
    setPayment(null)
    if (!current || result !== 'success') {
      setBusy(false)
      if (current) Alert.alert(t('pricingTitle'), t('paymentNotCompleted'))
      return
    }
    try {
      const outcome = await waitForCheckout(current.checkoutId, { get: (id) => getCheckout(id) })
      await subQuery.refresh()
      const message =
        outcome === 'COMPLETED'
          ? t('paymentDone')
          : outcome === 'NEEDS_REVIEW'
            ? t('paymentReview')
            : outcome === 'CANCELLED'
              ? t('paymentNotCompleted')
              : t('paymentPending')
      Alert.alert(t('pricingTitle'), message)
    } finally {
      setBusy(false)
    }
  }

  const onSubscribe = async (planCode: string) => {
    setBusy(true)
    try {
      await subscribeToPlan(planCode)
      await subQuery.refresh()
      Alert.alert(t('pricingTitle'), t('dzSubscribeDone'))
      setBusy(false)
    } catch (err) {
      if (apiErrorCode(err) === 'PAYMENT_REQUIRED') {
        // No trial left for this plan: it is paid for by card.
        await onPay(planCode)
        return
      }
      Alert.alert(t('authErrorTitle'), subscribeErrorMessage(err, locale))
      setBusy(false)
    }
  }

  const onCancel = async () => {
    setBusy(true)
    try {
      await cancelSubscription()
      await subQuery.refresh()
      Alert.alert(t('pricingTitle'), t('pricingCancelled'))
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('pricingTitle')} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.heading}>
            <Text style={styles.headingTitle}>{t('pricingHeadingTitle')}</Text>
            <Text style={styles.headingSubtitle}>{t('pricingHeadingSubtitle')}</Text>
          </View>

          {plansQuery.error && !plansQuery.data && !plansQuery.loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={plansQuery.retry}
            />
          ) : !plansQuery.data ? (
            <ActivityIndicator style={styles.loading} color={colors.brand} />
          ) : cards.length === 0 ? (
            <Text style={styles.empty}>{t('pricingUnavailable')}</Text>
          ) : (
            cards.map((card) => {
              const plan = plansQuery.data?.find((item) => item.code === card.code)
              const action = plan ? planAction(plan, subscription) : 'none'
              return (
              <View key={card.code} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  {card.current ? (
                    <View style={[styles.badge, styles.badgeSuccess]}>
                      <Text style={[styles.badgeText, styles.badgeTextSuccess]}>{t('dzPlanCurrent')}</Text>
                    </View>
                  ) : (
                    <View />
                  )}
                  <Text style={styles.cardTitle}>{card.title}</Text>
                </View>
                <View style={styles.priceBlock}>
                  <Text style={styles.price}>{card.price}</Text>
                  {card.period ? <Text style={styles.period}>{card.period}</Text> : null}
                  {card.trial ? <Text style={styles.trial}>{card.trial}</Text> : null}
                </View>
                {card.features.length > 0 ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.features}>
                      {card.features.map((feature) => (
                        <View key={feature} style={styles.featureRow}>
                          <Text style={styles.featureLabel}>{feature}</Text>
                          <Check size={20} color={colors.brand} strokeWidth={1.5} />
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
                <Button
                  variant="primary"
                  fullWidth
                  disabled={busy || action === 'current' || action === 'none'}
                  onPress={() => void (action === 'pay' ? onPay(card.code) : onSubscribe(card.code))}
                >
                  {action === 'current' ? t('dzPlanCurrent') : action === 'pay' ? t('pricingPay') : t('pricingSelectPlan')}
                </Button>
              </View>
              )
            })
          )}

          <Text style={styles.disclaimer}>{t('pricingDisclaimer')}</Text>
          {live ? (
            <Button variant="outline" fullWidth disabled={busy} onPress={() => void onCancel()}>
              {t('pricingCancelPlan')}
            </Button>
          ) : null}
        </View>
      </ScrollView>
      <PaymentSheet url={payment?.url ?? null} onDone={(result) => void onPaymentDone(result)} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.homeBg,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 343,
    gap: 20,
  },
  heading: {
    width: '100%',
    gap: 16,
  },
  headingTitle: {
    fontFamily: 'Heebo',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headingSubtitle: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  loading: {
    paddingVertical: 32,
  },
  empty: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.brand,
    borderRadius: 8,
    padding: 16,
    gap: 16,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 16,
  },
  badgeSuccess: {
    backgroundColor: '#ECFDF3',
  },
  badgeText: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  badgeTextSuccess: {
    color: '#039855',
  },
  priceBlock: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 4,
  },
  price: {
    fontFamily: 'Heebo',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  period: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  trial: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  features: {
    width: '100%',
    gap: 12,
  },
  featureRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  featureLabel: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  disclaimer: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
