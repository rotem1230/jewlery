import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Check } from 'lucide-react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { Button } from '@/src/components/ui/Button'
import { listPlans, subscribeToPlan, cancelSubscription, getMySubscription } from '@/src/api/subscriptions'
import { parseApiError } from '@/src/lib/api'
import { formatMoney } from '@/src/lib/format'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'

type PlanBadge = { labelKey: TranslationKey; tone: 'success' | 'brand' }

type Plan = {
  id: string
  titleKey: TranslationKey
  badge?: PlanBadge
  priceKey: TranslationKey
  periodKey: TranslationKey
  extraLineKeys?: [TranslationKey, TranslationKey]
  featureKeys: TranslationKey[]
}

const PLANS: Plan[] = [
  {
    id: 'per-item',
    titleKey: 'pricingPlanPerItemTitle',
    priceKey: 'pricingPlanPerItemPrice',
    periodKey: 'pricingPlanPerItemPeriod',
    featureKeys: [
      'pricingFeaturePerItemDesign',
      'pricingFeatureNoWatermark',
      'pricingFeaturePersonalAvatar',
      'pricingFeatureExportHdImage',
    ],
  },
  {
    id: 'monthly',
    titleKey: 'pricingPlanMonthlyTitle',
    priceKey: 'pricingPlanMonthlyPrice',
    periodKey: 'pricingPlanMonthlyPeriod',
    featureKeys: [
      'pricingFeatureUnlimitedCatalog',
      'pricingFeatureNoWatermark',
      'pricingFeatureAdvancedAvatars',
      'pricingFeatureClientChat',
      'pricingFeatureExportModelHd',
    ],
  },
  {
    id: 'yearly',
    titleKey: 'pricingPlanYearlyTitle',
    badge: { labelKey: 'pricingPlanYearlyBadge', tone: 'success' },
    priceKey: 'pricingPlanYearlyPrice',
    periodKey: 'pricingPlanYearlyPeriod',
    extraLineKeys: ['pricingPlanYearlyLeadsIncluded', 'pricingPlanYearlyLeadsExtra'],
    featureKeys: [
      'pricingFeatureAllMonthly',
      'pricingFeatureCloudPriority',
      'pricingFeatureVerifiedBadge',
      'pricingFeatureEarlyAccess',
    ],
  },
  {
    id: 'pro',
    titleKey: 'pricingPlanProTitle',
    badge: { labelKey: 'pricingPlanProBadge', tone: 'brand' },
    priceKey: 'pricingPlanProPrice',
    periodKey: 'pricingPlanProPeriod',
    featureKeys: [
      'pricingFeatureAllYearly',
      'pricingFeatureAdvancedAnalytics',
      'pricingFeatureVipSupport',
      'pricingFeatureFullLibraryAccess',
    ],
  },
]

const FIGMA_BY_CODE: Record<string, Plan> = {
  DESIGNER_FREE: { ...PLANS[0], id: 'DESIGNER_FREE' },
  DESIGNER_PRO: { ...PLANS[1], id: 'DESIGNER_PRO' },
  JEWELER_BASIC: { ...PLANS[2], id: 'JEWELER_BASIC' },
  JEWELER_ACTIVE: { ...PLANS[3], id: 'JEWELER_ACTIVE' },
}

function inclusionBullets(inclusions: unknown): string[] {
  if (Array.isArray(inclusions)) {
    return inclusions.filter((item): item is string => typeof item === 'string')
  }
  if (inclusions && typeof inclusions === 'object' && Array.isArray((inclusions as { bullets?: unknown }).bullets)) {
    return (inclusions as { bullets: unknown[] }).bullets.filter((item): item is string => typeof item === 'string')
  }
  return []
}

/**
 * Figma pricing/designers — live `GET /subscriptions/plans` with Figma labels mapped by code.
 */
export function PricingScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation()
  const role = useAppSelector((s) => s.auth.user?.activeRole)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const plansQuery = useAsyncData(
    (signal) => listPlans(role === 'JEWELER' ? 'JEWELER' : 'DESIGNER', signal),
    { deps: [accessToken, role] },
  )
  const subQuery = useAsyncData((signal) => getMySubscription(signal), { deps: [accessToken] })
  const [busy, setBusy] = useState(false)
  const livePlans = plansQuery.data ?? []
  const subscription = subQuery.data
  const canCancel =
    Boolean(subscription) && ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(subscription?.status ?? '')

  const onSubscribe = async (planCode: string) => {
    setBusy(true)
    try {
      await subscribeToPlan(planCode)
      await subQuery.refresh()
      Alert.alert(t('pricingTitle'), t('pricingSelectPlan'))
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
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

          {livePlans.length > 0
            ? livePlans.map((plan) => {
                const figma = FIGMA_BY_CODE[plan.code]
                const inclusions = inclusionBullets(plan.inclusions)
                const features =
                  inclusions.length > 0
                    ? inclusions
                    : (figma?.featureKeys.map((key) => t(key)) ?? [])
                const title = figma
                  ? t(figma.titleKey)
                  : locale === 'en' && plan.nameEn
                    ? plan.nameEn
                    : plan.nameHe
                return (
                  <View key={plan.id} style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      {figma?.badge ? (
                        <View
                          style={[
                            styles.badge,
                            figma.badge.tone === 'success' ? styles.badgeSuccess : styles.badgeBrand,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              figma.badge.tone === 'success'
                                ? styles.badgeTextSuccess
                                : styles.badgeTextBrand,
                            ]}
                          >
                            {t(figma.badge.labelKey)}
                          </Text>
                        </View>
                      ) : (
                        <View />
                      )}
                      <Text style={styles.cardTitle}>{title}</Text>
                    </View>
                    <View style={styles.priceBlock}>
                      <Text style={styles.price}>{formatMoney(plan.price)}</Text>
                      <Text style={styles.period}>
                        {figma ? t(figma.periodKey) : plan.billingCycle}
                      </Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.features}>
                      {features.map((feature) => (
                        <View key={feature} style={styles.featureRow}>
                          <Text style={styles.featureLabel}>{feature}</Text>
                          <Check size={20} color={colors.brand} strokeWidth={1.5} />
                        </View>
                      ))}
                    </View>
                    <Button
                      variant="primary"
                      fullWidth
                      disabled={busy}
                      onPress={() => void onSubscribe(plan.code)}
                    >
                      {t('pricingSelectPlan')}
                    </Button>
                  </View>
                )
              })
            : PLANS.map((plan) => (
            <View key={plan.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                {plan.badge ? (
                  <View
                    style={[
                      styles.badge,
                      plan.badge.tone === 'success' ? styles.badgeSuccess : styles.badgeBrand,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        plan.badge.tone === 'success'
                          ? styles.badgeTextSuccess
                          : styles.badgeTextBrand,
                      ]}
                    >
                      {t(plan.badge.labelKey)}
                    </Text>
                  </View>
                ) : (
                  <View />
                )}
                <Text style={styles.cardTitle}>{t(plan.titleKey)}</Text>
              </View>

              <View style={styles.priceBlock}>
                <Text style={styles.price}>{t(plan.priceKey)}</Text>
                <Text style={styles.period}>{t(plan.periodKey)}</Text>
              </View>

              <View style={styles.divider} />

              {plan.extraLineKeys ? (
                <View style={styles.extraBlock}>
                  <Text style={styles.extraPrimary}>{t(plan.extraLineKeys[0])}</Text>
                  <Text style={styles.extraSecondary}>{t(plan.extraLineKeys[1])}</Text>
                </View>
              ) : null}

              <View style={styles.features}>
                {plan.featureKeys.map((featureKey) => (
                  <View key={featureKey} style={styles.featureRow}>
                    <Text style={styles.featureLabel}>{t(featureKey)}</Text>
                    <Check size={20} color={colors.brand} strokeWidth={1.5} />
                  </View>
                ))}
              </View>

                    <Button
                      variant="primary"
                      fullWidth
                      onPress={() =>
                        Alert.alert(t('authErrorTitle'), t('pricingUnavailable'))
                      }
                    >
              {t('pricingSelectPlan')}
                    </Button>
            </View>
          ))}

          <Text style={styles.disclaimer}>{t('pricingDisclaimer')}</Text>
          {canCancel ? (
            <Button variant="outline" fullWidth disabled={busy} onPress={() => void onCancel()}>
              {t('pricingCancelPlan')}
            </Button>
          ) : null}
        </View>
      </ScrollView>
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
  badgeBrand: {
    backgroundColor: colors.brand,
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
  badgeTextBrand: {
    color: colors.textInverse,
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
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  extraBlock: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 4,
  },
  extraPrimary: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  extraSecondary: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
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
