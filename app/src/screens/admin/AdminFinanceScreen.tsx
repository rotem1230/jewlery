import { useState } from 'react'
import { financeReport, type FinanceRow } from '@/src/api/admin'
import { AdminCard, AdminChips, AdminRow, AdminScreen, AdminText, AdminTitle, useRangeOptions } from '@/src/components/admin/AdminLayout'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { reportRange, type RangeKind } from '@/src/lib/admin'
import { formatMoney } from '@/src/lib/format'
import { useTranslation } from '@/src/i18n'

const m = (value: number) => formatMoney(Math.round(value * 100) / 100)

/** Revenue and expenses per plan, the totals, and the jewelry money (owed / transferred to jewelers). */
export function AdminFinanceScreen() {
  const { t } = useTranslation()
  const rangeOptions = useRangeOptions()
  const [range, setRange] = useState<RangeKind>('this_month')
  const report = useAsyncData((signal) => financeReport(reportRange(range), signal), { deps: [range] })
  const data = report.data

  const planCard = (row: FinanceRow) => (
    <AdminCard key={row.code}>
      <AdminTitle>{row.code === 'NONE' ? t('admNoPlan') : row.nameHe}</AdminTitle>
      {row.code !== 'NONE' ? <AdminRow label={t('admSubscribers')} value={String(row.activeSubscribers)} /> : null}
      <AdminRow label={t('admPaymentsCount')} value={String(row.payments)} />
      <AdminRow label={t('admRevenue')} value={m(row.revenue)} />
      <AdminRow label={t('admRefunds')} value={m(row.refunds)} />
      <AdminRow label={t('admCardFees')} value={m(row.cardFees)} />
      <AdminRow label={t('admAiCost')} value={m(row.aiCost)} />
      <AdminRow label={t('admStorageCost')} value={m(row.storageCost)} />
      <AdminRow label={t('admTrafficCost')} value={m(row.trafficCost)} />
      <AdminRow label={t('admNet')} value={m(row.net)} strong />
    </AdminCard>
  )

  return (
    <AdminScreen title={t('admFinance')} loading={report.loading} error={report.error} refreshing={report.refreshing} onRefresh={report.refresh} onRetry={report.retry}>
      <AdminChips options={rangeOptions} value={range} onChange={setRange} />
      {data ? (
        <>
          <AdminCard>
            <AdminTitle>{t('admTotals')}</AdminTitle>
            <AdminRow label={t('admRevenue')} value={m(data.totals.revenue)} />
            <AdminRow label={t('admRefunds')} value={m(data.totals.refunds)} />
            <AdminRow label={t('admCardFees')} value={m(data.totals.cardFees)} />
            <AdminRow label={t('admAiCost')} value={m(data.totals.aiCost)} />
            <AdminRow label={t('admStorageCost')} value={m(data.totals.storageCost)} />
            <AdminRow label={t('admTrafficCost')} value={m(data.totals.trafficCost)} />
            <AdminRow label={t('admNet')} value={m(data.totals.net)} strong />
            <AdminRow label={t('admCommission')} value={m(data.totals.jewelryCommission)} />
          </AdminCard>
          {data.plans.filter((row) => row.payments > 0 || row.activeSubscribers > 0 || row.aiCost + row.storageCost + row.trafficCost > 0).map(planCard)}
          <AdminCard>
            <AdminTitle>{t('admJewelrySection')}</AdminTitle>
            <AdminRow label={t('admPaymentsCount')} value={String(data.jewelry.payments)} />
            <AdminRow label={t('admJewelryGross')} value={m(data.jewelry.gross)} />
            <AdminRow label={t('admRefunds')} value={m(data.jewelry.refunds)} />
            <AdminRow label={t('admCardFees')} value={m(data.jewelry.cardFees)} />
            <AdminRow label={t('admCommission')} value={m(data.jewelry.commission)} />
            <AdminRow label={t('admOwed')} value={m(data.jewelry.owedToJewelers)} strong />
            <AdminRow label={t('admTransferred')} value={m(data.jewelry.transferredToJewelers)} />
            <AdminRow label={t('admRecover')} value={m(data.jewelry.toRecoverFromJewelers)} />
          </AdminCard>
          <AdminCard>
            <AdminTitle>{t('admAssumptionsTitle')}</AdminTitle>
            <AdminText muted>
              {`AI: ${formatMoney(data.assumptions.aiImageCostIls)} · ${t('admStorage')}: ${formatMoney(data.assumptions.storageIlsPerGbMonth)}/GB · ${t('admTraffic')}: ${formatMoney(data.assumptions.trafficIlsPerGb)}/GB · ${t('admCardFees')}: ${data.assumptions.cardFeePercent}%`}
            </AdminText>
          </AdminCard>
        </>
      ) : null}
    </AdminScreen>
  )
}
