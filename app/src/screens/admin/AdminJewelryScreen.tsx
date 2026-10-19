import { useState } from 'react'
import { Alert } from 'react-native'
import { listJewelryPayments, listPayouts, markPayoutPaid, refundJewelryPayment, type Payout } from '@/src/api/admin'
import { AdminCard, AdminChips, AdminRow, AdminScreen, AdminText, AdminTitle } from '@/src/components/admin/AdminLayout'
import { RefundForm } from '@/src/components/admin/RefundForm'
import { Button } from '@/src/components/ui/Button'
import { Field } from '@/src/components/ui/Field'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { payoutDueLabel } from '@/src/lib/admin'
import { parseApiError } from '@/src/lib/api'
import { formatMoney } from '@/src/lib/format'
import { useTranslation } from '@/src/i18n'
import { RefundList } from './AdminPaymentsScreen'

type Tab = 'payments' | 'OWED' | 'PAID'

/** A payout to transfer: what is due, the jeweler's contact, and recording the transfer once. */
function PayoutCard({ payout, onChanged }: { payout: Payout; onChanged: () => void }) {
  const { t, locale } = useTranslation()
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const mark = async () => {
    if (!reference.trim()) return
    setBusy(true)
    try {
      await markPayoutPaid(payout.id, reference.trim())
      onChanged()
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AdminCard>
      <AdminTitle>{payout.jeweler.businessName ?? payout.jeweler.name ?? payout.jeweler.email}</AdminTitle>
      <AdminText muted>{[payout.jeweler.email, payout.jeweler.phone].filter(Boolean).join(' · ')}</AdminText>
      <AdminRow label={t('admJewelryGross')} value={formatMoney(payout.gross)} />
      <AdminRow label={t('admCommission')} value={formatMoney(payout.commission)} />
      <AdminRow label={t('admCommissionNet')} value={formatMoney(payout.net)} />
      {payout.refunded > 0 ? <AdminRow label={t('admRefunded')} value={formatMoney(payout.refunded)} /> : null}
      <AdminText>{payoutDueLabel(payout.due, payout.currency, locale)}</AdminText>
      {payout.status === 'PAID' ? <AdminText muted>{`${payout.paidReference ?? ''} · ${payout.paidAt ? new Date(payout.paidAt).toLocaleDateString('he-IL') : ''}`}</AdminText> : null}
      {payout.status === 'OWED' ? (
        <>
          <Field label={t('admTransferRef')} value={reference} onChangeText={setReference} />
          <Button variant="primary" size="sm" fullWidth disabled={busy || !reference.trim()} onPress={() => void mark()}>
            {t('admMarkPaid')}
          </Button>
        </>
      ) : null}
    </AdminCard>
  )
}

/** Jewelry payments (with refunds) and what is owed to / was transferred to jewelers. */
export function AdminJewelryScreen() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('payments')
  const [open, setOpen] = useState<string | null>(null)
  const payments = useAsyncData((signal) => listJewelryPayments(signal), { deps: [tab] })
  const payouts = useAsyncData((signal) => (tab === 'payments' ? Promise.resolve([] as Payout[]) : listPayouts(tab, signal)), { deps: [tab] })
  const active = tab === 'payments' ? payments : payouts

  return (
    <AdminScreen title={t('admJewelry')} loading={active.loading} error={active.error} refreshing={active.refreshing} onRefresh={active.refresh} onRetry={active.retry}>
      <AdminChips
        options={[
          { key: 'payments' as Tab, label: t('admTabPayments') },
          { key: 'OWED' as Tab, label: t('admTabOwed') },
          { key: 'PAID' as Tab, label: t('admTabPaid') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'payments'
        ? (payments.data ?? []).map((payment) => (
            <AdminCard key={payment.id}>
              <AdminTitle>{`${payment.designer?.name ?? payment.designer?.email ?? ''} → ${payment.jeweler?.name ?? payment.jeweler?.email ?? ''}`}</AdminTitle>
              <AdminRow label={t('admPaymentsCount')} value={formatMoney(payment.amount)} strong />
              <AdminRow label={t('admRefunded')} value={formatMoney(payment.refunded)} />
              <RefundList refunds={payment.refunds} onChanged={payments.refresh} />
              {payment.refundable > 0 ? (
                open === payment.id ? (
                  <RefundForm
                    refundable={payment.refundable}
                    onSubmit={(body) => refundJewelryPayment(payment.id, body)}
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
          ))
        : (payouts.data ?? []).map((payout) => <PayoutCard key={payout.id} payout={payout} onChanged={payouts.refresh} />)}
      {(tab === 'payments' ? payments.data ?? [] : payouts.data ?? []).length === 0 ? <AdminText muted>{t('admEmpty')}</AdminText> : null}
    </AdminScreen>
  )
}
