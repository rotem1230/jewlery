import { useNavigation, useFocusEffect } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback, useState } from 'react'
import { listAdminPlans, type AdminPlan } from '@/src/api/admin'
import { AdminCard, AdminRow, AdminScreen, AdminText, AdminTitle } from '@/src/components/admin/AdminLayout'
import { Button } from '@/src/components/ui/Button'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { formatMoney } from '@/src/lib/format'
import type { ProfileStackParamList } from '@/src/navigation/types'
import { useTranslation } from '@/src/i18n'

export function cycleLabel(cycle: string, t: ReturnType<typeof useTranslation>['t']): string {
  return cycle === 'QUARTERLY' ? t('admCycleQuarterly') : cycle === 'ANNUAL' ? t('admCycleAnnual') : t('admCycleMonthly')
}

/**
 * The plans on offer, by user type: price, cycle, quotas and live subscribers. Plans withdrawn from
 * the price list (the old "Active" / free "Basic" jeweler plans of before 19.10) are listed apart,
 * on request, so they are not read as part of the offer (the client's notes of 23.11); they stay
 * editable, e.g. to offer one again.
 */
export function AdminPlansScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>()
  const plans = useAsyncData((signal) => listAdminPlans(signal))
  const [showWithdrawn, setShowWithdrawn] = useState(false)
  useFocusEffect(
    useCallback(() => {
      plans.refresh()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const offered = (plans.data ?? []).filter((plan) => plan.isActive)
  const withdrawn = (plans.data ?? []).filter((plan) => !plan.isActive)
  const group = (role: 'DESIGNER' | 'JEWELER') => offered.filter((plan) => plan.role === role)
  const card = (plan: AdminPlan) => (
    <AdminCard key={plan.code} onPress={() => navigation.navigate('AdminPlanEdit', { code: plan.code })}>
      <AdminTitle>{plan.nameHe}</AdminTitle>
      {!plan.isActive ? <AdminText muted>{t('admInactive')}</AdminText> : null}
      <AdminRow label={t('admFieldPrice')} value={`${formatMoney(plan.price)} · ${cycleLabel(plan.billingCycle, t)}`} />
      {plan.aiRenders !== null ? <AdminRow label={t('admFieldAi')} value={String(plan.aiRenders)} /> : null}
      {plan.leadQuota > 0 ? <AdminRow label={t('admFieldLeads')} value={String(plan.leadQuota)} /> : null}
      <AdminRow label={t('admSubscribers')} value={String(plan.liveSubscribers)} />
    </AdminCard>
  )

  return (
    <AdminScreen title={t('admPlans')} loading={plans.loading} error={plans.error} refreshing={plans.refreshing} onRefresh={plans.refresh} onRetry={plans.retry}>
      <AdminTitle>{t('admDesigners')}</AdminTitle>
      {group('DESIGNER').map(card)}
      <Button variant="outline" fullWidth onPress={() => navigation.navigate('AdminPlanEdit', { role: 'DESIGNER' })}>
        {`${t('admNewPlan')} · ${t('admDesigner')}`}
      </Button>
      <AdminTitle>{t('admJewelers')}</AdminTitle>
      {group('JEWELER').map(card)}
      <Button variant="outline" fullWidth onPress={() => navigation.navigate('AdminPlanEdit', { role: 'JEWELER' })}>
        {`${t('admNewPlan')} · ${t('admJeweler')}`}
      </Button>
      {withdrawn.length > 0 ? (
        <Button variant="outline" fullWidth onPress={() => setShowWithdrawn((on) => !on)}>
          {showWithdrawn ? t('admHideWithdrawn') : t('admShowWithdrawn').replace('{{count}}', String(withdrawn.length))}
        </Button>
      ) : null}
      {showWithdrawn && withdrawn.length > 0 ? (
        <>
          <AdminTitle>{t('admWithdrawnPlans')}</AdminTitle>
          <AdminText muted>{t('admWithdrawnHint')}</AdminText>
          {withdrawn.map(card)}
        </>
      ) : null}
    </AdminScreen>
  )
}
