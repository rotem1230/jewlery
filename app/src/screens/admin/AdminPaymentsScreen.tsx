import { useState } from 'react'
import { Alert, View } from 'react-native'
import { listPlanPayments, refundPlanPayment, resolveRefund, type PlanPayment, type RefundView } from '@/src/api/admin'
import { AdminCard, AdminRow, AdminScreen, AdminText, AdminTitle } from '@/src/components/admin/AdminLayout'
import { RefundForm, refundStatusLabel } from '@/src/components/admin/RefundForm'
import { Button } from '@/src/components/ui/Button'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { parseApiError } from '@/src/lib/api'
import { formatMoney } from '@/src/lib/format'
import { useTranslation } from '@/src/i18n'

/** A refund of unknown outcome: settled by hand after checking the Cardcom panel. */
export function UnknownRefundActions({ refund, onDone }: { refund: RefundView; onDone: () => void }) {
  const { t } = useTranslation()
  const settle = async (outcome: 'SUCCEEDED' | 'FAILED') => {
    try {
      await resolveRefund(refund.id, outcome)
      onDone()
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    }
  }
  return (
    <View style={{ gap: 6 }}>
      <Button variant="outline" size="sm" fullWidth onPress={() => void settle('SUCCEEDED')}>
        {t('admResolveDone')}
      </Button>
      <Button variant="ghost" size="sm" fullWidth onPress={() => void settle('FAILED')}>
        {t('admResolveFailed')}
      </Button>
    </View>
  )
}

export function RefundList({ refunds, onChanged }: { refunds: RefundView[]; onChanged: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      {refunds.map((refund) => (
        <View key={refund.id} style={{ gap: 4 }}>
          <AdminText muted>{`${t('admRefund')}: ${formatMoney(refund.amount)} · ${refundStatusLabel(refund.status, t)} · ${refund.reason}`}</AdminText>
          {refund.status === 'UNKNOWN' ? <UnknownRefundActions refund={refund} onDone={onChanged} /> : null}
        </View>
      ))}
    </>
  )
}

/** Plan payments by card (newest first): refund all or part, and settle refunds of unknown outcome. */
export function AdminPaymentsScreen() {
  const { t } = useTranslation()
  const payments = useAsyncData((signal) => listPlanPayments(signal))
  const [open, setOpen] = useState<string | null>(null)

  const card = (payment: PlanPayment) => (
    <AdminCard key={payment.id}>
      <AdminTitle>{`${payment.user.name ?? payment.user.email} · ${payment.plan.nameHe}`}</AdminTitle>
      <AdminText muted>{`${payment.user.email} · ${new Date(payment.paidAt).toLocaleDateString('he-IL')}`}</AdminText>
      <AdminRow label={t('admPaymentsCount')} value={formatMoney(payment.amount)} strong />
      <AdminRow label={t('admRefunded')} value={formatMoney(payment.refunded)} />
      <AdminRow label={t('admRefundable')} value={formatMoney(payment.refundable)} />
      <RefundList refunds={payment.refunds} onChanged={payments.refresh} />
      {payment.provider === 'cardcom' && payment.refundable > 0 ? (
        open === payment.id ? (
          <RefundForm
            refundable={payment.refundable}
            withEndPlan
            onSubmit={(body) => refundPlanPayment(payment.id, body)}
            onDone={() => {
              setOpen(null)
              payments.refresh()
            }}
          />
        ) : (
          <Button variant="outline" size="sm" fullWidth onPress={() => setOpen(payment.id)}>
            {t('admRefund')}
          </Button>
        )
      ) : null}
    </AdminCard>
  )

  return (
    <AdminScreen title={t('admPayments')} loading={payments.loading} error={payments.error} refreshing={payments.refreshing} onRefresh={payments.refresh} onRetry={payments.retry}>
      {(payments.data ?? []).length === 0 ? <AdminText muted>{t('admEmpty')}</AdminText> : null}
      {(payments.data ?? []).map(card)}
    </AdminScreen>
  )
}
