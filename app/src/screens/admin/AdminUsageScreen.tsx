import { useState } from 'react'
import { usageReport } from '@/src/api/admin'
import { AdminCard, AdminChips, AdminRow, AdminScreen, AdminText, AdminTitle, useRangeOptions } from '@/src/components/admin/AdminLayout'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { alertLabel, formatBytes, reportRange, type RangeKind } from '@/src/lib/admin'
import { formatMoney } from '@/src/lib/format'
import { useTranslation } from '@/src/i18n'

const m = (value: number) => formatMoney(Math.round(value * 100) / 100)

/** Usage and costs per user (most costly first), with their fair-use alerts. */
export function AdminUsageScreen() {
  const { t, locale } = useTranslation()
  const rangeOptions = useRangeOptions()
  const [range, setRange] = useState<RangeKind>('this_month')
  const report = useAsyncData((signal) => usageReport(reportRange(range), signal), { deps: [range] })
  const users = report.data?.users ?? []

  return (
    <AdminScreen title={t('admUsage')} loading={report.loading} error={report.error} refreshing={report.refreshing} onRefresh={report.refresh} onRetry={report.retry}>
      <AdminChips options={rangeOptions} value={range} onChange={setRange} />
      {users.length === 0 ? <AdminText muted>{t('admEmpty')}</AdminText> : null}
      {users.map((row) => (
        <AdminCard key={row.user.id}>
          <AdminTitle>{row.user.name ?? row.user.email}</AdminTitle>
          <AdminText muted>{`${row.user.email} · ${row.plan?.nameHe ?? t('admNoPlan')}`}</AdminText>
          <AdminRow label={t('admAiCreations')} value={`${row.aiCreations} · ${m(row.aiCost)}`} />
          <AdminRow label={t('admStorage')} value={`${formatBytes(row.storageBytes)} · ${m(row.storageCost)}`} />
          <AdminRow label={t('admTraffic')} value={`${formatBytes(row.trafficBytes)} · ${m(row.trafficCost)}`} />
          <AdminRow label={t('admTotalCost')} value={m(row.totalCost)} strong />
          <AdminRow label={t('admRevenue')} value={m(row.revenue - row.refunds)} />
          {row.alerts.length > 0 ? <AdminText>{`${t('admAlerts')}: ${row.alerts.map((alert) => alertLabel(alert.kind, locale)).join(' · ')}`}</AdminText> : null}
        </AdminCard>
      ))}
    </AdminScreen>
  )
}
