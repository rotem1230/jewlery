import { listReviewItems } from '@/src/api/admin'
import { AdminCard, AdminScreen, AdminText, AdminTitle } from '@/src/components/admin/AdminLayout'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { formatMoney } from '@/src/lib/format'
import { useTranslation } from '@/src/i18n'

/** Payments kept for review: money that arrived but could not be applied safely. */
export function AdminReviewScreen() {
  const { t } = useTranslation()
  const items = useAsyncData((signal) => listReviewItems(signal))
  return (
    <AdminScreen title={t('admReview')} loading={items.loading} error={items.error} refreshing={items.refreshing} onRefresh={items.refresh} onRetry={items.retry}>
      <AdminText muted>{t('admReviewHint')}</AdminText>
      {(items.data ?? []).length === 0 ? <AdminText muted>{t('admEmpty')}</AdminText> : null}
      {(items.data ?? []).map((item) => (
        <AdminCard key={item.id}>
          <AdminTitle>{item.amount !== null ? formatMoney(item.amount) : item.type}</AdminTitle>
          <AdminText>{item.note ?? item.type}</AdminText>
          <AdminText muted>{[new Date(item.processedAt).toLocaleString('he-IL'), item.transactionId ? `#${item.transactionId}` : null].filter(Boolean).join(' · ')}</AdminText>
        </AdminCard>
      ))}
    </AdminScreen>
  )
}
