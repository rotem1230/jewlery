import { useRef, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import type { RefundView } from '@/src/api/admin'
import { Button } from '@/src/components/ui/Button'
import { Field } from '@/src/components/ui/Field'
import { Toggle } from '@/src/components/ui/Toggle'
import { newRequestId, refundRequest } from '@/src/lib/admin'
import { parseApiError } from '@/src/lib/api'
import { formatMoney } from '@/src/lib/format'
import { useTranslation } from '@/src/i18n'

export function refundStatusLabel(status: string, t: ReturnType<typeof useTranslation>['t']): string {
  switch (status) {
    case 'SUCCEEDED':
      return t('admStatusSucceeded')
    case 'FAILED':
      return t('admStatusFailed')
    case 'UNKNOWN':
      return t('admStatusUnknown')
    default:
      return t('admStatusPending')
  }
}

/**
 * Refunding a payment: an amount (empty = all that is left), a reason, and for a plan payment
 * whether the plan ends now. One request id per refund: a double tap sends the same refund.
 */
export function RefundForm({
  refundable,
  withEndPlan,
  onSubmit,
  onDone,
}: {
  refundable: number
  withEndPlan?: boolean
  onSubmit: (body: { amount?: number; reason: string; endSubscription?: boolean; requestId: string }) => Promise<RefundView>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [endPlan, setEndPlan] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const requestId = useRef(newRequestId())

  const submit = async () => {
    const request = refundRequest(amount, refundable, reason)
    if (!request.body) {
      setError(request.error)
      return
    }
    setError(undefined)
    setBusy(true)
    try {
      const refund = await onSubmit({ ...request.body, ...(withEndPlan ? { endSubscription: endPlan } : {}), requestId: requestId.current })
      const reasonText = refund.failureReason ? `\n${refund.failureReason}` : ''
      Alert.alert(t('admRefund'), `${refundStatusLabel(refund.status, t)} · ${formatMoney(refund.amount)}${reasonText}`)
      // The next refund is another request.
      requestId.current = newRequestId()
      setAmount('')
      setReason('')
      onDone()
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.form}>
      <Field label={t('admRefundAmount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={error && amount ? error : undefined} />
      <Field label={t('admRefundReason')} value={reason} onChangeText={setReason} error={error && !amount ? error : undefined} />
      {withEndPlan ? <Toggle value={endPlan} onChange={setEndPlan} label={t('admRefundEndPlan')} /> : null}
      <Button variant="outline" fullWidth disabled={busy || refundable <= 0} onPress={() => void submit()}>
        {t('admRefundSend')}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 8, marginTop: 4 },
})
