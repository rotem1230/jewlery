import { useNavigation, useFocusEffect } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback } from 'react'
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

/** Every plan (offered or not), by user type: price, cycle, quotas and live subscribers. */
export function AdminPlansScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>()
  const plans = useAsyncData((signal) => listAdminPlans(signal))
  useFocusEffect(
    useCallback(() => {
      plans.refresh()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const group = (role: 'DESIGNER' | 'JEWELER') => (plans.data ?? []).filter((plan) => plan.role === role)
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
    </AdminScreen>
  )
}
