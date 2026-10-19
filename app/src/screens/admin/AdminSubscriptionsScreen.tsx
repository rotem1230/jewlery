import { useRef, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import {
  addSubscriptionLeads,
  endSubscription,
  extendSubscription,
  listAdminSubscriptions,
  type AdminSubscription,
  type AdminSubscriptionsQuery,
} from '@/src/api/admin'
import { AdminCard, AdminChips, AdminScreen, AdminText, AdminTitle } from '@/src/components/admin/AdminLayout'
import { Button } from '@/src/components/ui/Button'
import { Field } from '@/src/components/ui/Field'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { adminActionRequest, leadsLabel, newRequestId, subscriptionValidity } from '@/src/lib/admin'
import { parseApiError } from '@/src/lib/api'
import { formatMoney } from '@/src/lib/format'
import { useTranslation } from '@/src/i18n'

type RoleFilter = 'all' | 'DESIGNER' | 'JEWELER'
type StatusFilter = 'live' | 'all'
type ActionKind = 'extend' | 'leads' | 'end' | 'endNow'

const LIVE = ['TRIALING', 'ACTIVE', 'PAST_DUE']
const MAX_DAYS = 365
const MAX_LEADS = 100

/**
 * One plan's admin actions: extend it, add leads (jewelers), end it at period end or now. One
 * reason for all of them (kept in the audit log); one request id per action, so a double tap or a
 * retry is applied once, and a new one after it went through.
 */
function SubscriptionActions({ sub, onChanged }: { sub: AdminSubscription; onChanged: () => void }) {
  const { t, locale } = useTranslation()
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('')
  const [count, setCount] = useState('')
  const [errors, setErrors] = useState<{ reason?: string; days?: string; count?: string }>({})
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const ids = useRef<Record<ActionKind, string>>({ extend: newRequestId(), leads: newRequestId(), end: newRequestId(), endNow: newRequestId() })

  const run = async (kind: ActionKind, send: (requestId: string) => Promise<AdminSubscription>, done: (updated: AdminSubscription) => string) => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    try {
      const updated = await send(ids.current[kind])
      ids.current[kind] = newRequestId()
      setReason('')
      setDays('')
      setCount('')
      setErrors({})
      Alert.alert(t('admSubscriptions'), done(updated))
      onChanged()
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const onExtend = () => {
    const request = adminActionRequest(days, reason, MAX_DAYS)
    if (!request.body) {
      setErrors(request.field === 'reason' ? { reason: request.error } : { days: request.error })
      return
    }
    const { value, reason: why } = request.body
    void run(
      'extend',
      (requestId) => extendSubscription(sub.id, { days: value, reason: why, requestId }),
      (updated) => `${t('admExtendDone')} · ${subscriptionValidity(updated, locale)}`,
    )
  }

  const onAddLeads = () => {
    const request = adminActionRequest(count, reason, MAX_LEADS)
    if (!request.body) {
      setErrors(request.field === 'reason' ? { reason: request.error } : { count: request.error })
      return
    }
    const { value, reason: why } = request.body
    void run(
      'leads',
      (requestId) => addSubscriptionLeads(sub.id, { count: value, reason: why, requestId }),
      (updated) => (updated.leads ? `${t('admLeadsDone')} · ${leadsLabel(updated.leads, locale)}` : t('admLeadsDone')),
    )
  }

  const onEnd = (immediately: boolean) => {
    const why = reason.trim()
    if (!why) {
      setErrors({ reason: 'יש לכתוב סיבה' })
      return
    }
    const end = () =>
      void run(
        immediately ? 'endNow' : 'end',
        (requestId) => endSubscription(sub.id, { immediately, reason: why, requestId }),
        () => (immediately ? t('admEndedNow') : t('admEndDone')),
      )
    if (!immediately) {
      end()
      return
    }
    Alert.alert(t('admEndNow'), t('admEndConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('admEndNow'), style: 'destructive', onPress: end },
    ])
  }

  return (
    <View style={styles.actions}>
      <Field label={t('admActionReason')} value={reason} onChangeText={setReason} error={errors.reason} />
      <Field label={t('admExtendDays')} value={days} onChangeText={setDays} keyboardType="number-pad" error={errors.days} />
      <Button variant="outline" size="sm" fullWidth disabled={busy} onPress={onExtend}>
        {t('admExtend')}
      </Button>
      {sub.role === 'JEWELER' ? (
        <>
          <Field label={t('admLeadsCount')} value={count} onChangeText={setCount} keyboardType="number-pad" error={errors.count} />
          <Button variant="outline" size="sm" fullWidth disabled={busy} onPress={onAddLeads}>
            {t('admAddLeads')}
          </Button>
        </>
      ) : null}
      {!sub.cancelAtPeriodEnd ? (
        <Button variant="outline" size="sm" fullWidth disabled={busy} onPress={() => onEnd(false)}>
          {t('admEndAtPeriodEnd')}
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" fullWidth disabled={busy} onPress={() => onEnd(true)}>
        {t('admEndNow')}
      </Button>
    </View>
  )
}

/** The pricing table's "leads: counting, quotas and plan validity": every plan, when it ends, its leads. */
export function AdminSubscriptionsScreen() {
  const { t, locale } = useTranslation()
  const [role, setRole] = useState<RoleFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('live')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)

  const query: AdminSubscriptionsQuery = { status, page, ...(role !== 'all' ? { role } : {}), ...(q ? { q } : {}) }
  const subs = useAsyncData((signal) => listAdminSubscriptions(query, signal), { deps: [role, status, q, page] })
  const data = subs.data
  const items = data?.items ?? []
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? from + items.length - 1 : 0

  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
    setOpen(null)
  }

  return (
    <AdminScreen title={t('admSubscriptions')} loading={subs.loading} error={subs.error} refreshing={subs.refreshing} onRefresh={subs.refresh} onRetry={subs.retry}>
      <Field label={t('admSubsSearch')} value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={() => filter(setQ)(search.trim())} />
      <Button variant="primary" size="sm" fullWidth onPress={() => filter(setQ)(search.trim())}>
        {t('admSubsSearchGo')}
      </Button>
      <AdminChips
        options={[
          { key: 'all' as RoleFilter, label: t('admRoleAll') },
          { key: 'DESIGNER' as RoleFilter, label: t('admRoleDesigners') },
          { key: 'JEWELER' as RoleFilter, label: t('admRoleJewelers') },
        ]}
        value={role}
        onChange={filter(setRole)}
      />
      <AdminChips
        options={[
          { key: 'live' as StatusFilter, label: t('admStatusLive') },
          { key: 'all' as StatusFilter, label: t('admStatusAllPlans') },
        ]}
        value={status}
        onChange={filter(setStatus)}
      />
      {items.map((sub) => (
        <AdminCard key={sub.id}>
          <AdminTitle>{sub.user.name ?? sub.user.email}</AdminTitle>
          <AdminText muted>{[sub.user.name ? sub.user.email : null, sub.user.phone].filter(Boolean).join(' · ')}</AdminText>
          <AdminText>{`${sub.plan.nameHe} · ${formatMoney(sub.price)}`}</AdminText>
          <AdminText>{subscriptionValidity(sub, locale)}</AdminText>
          {sub.leads ? <AdminText>{leadsLabel(sub.leads, locale)}</AdminText> : null}
          {sub.pendingPlan ? <AdminText muted>{`${t('pricingNextPlan')} ${sub.pendingPlan.nameHe}`}</AdminText> : null}
          {sub.hasCard ? <AdminText muted>{t('admHasCard')}</AdminText> : null}
          {LIVE.includes(sub.status) ? (
            <>
              <Button variant="ghost" size="sm" fullWidth onPress={() => setOpen(open === sub.id ? null : sub.id)}>
                {t('admSubsActions')}
              </Button>
              {open === sub.id ? <SubscriptionActions sub={sub} onChanged={subs.refresh} /> : null}
            </>
          ) : null}
        </AdminCard>
      ))}
      {data && items.length === 0 ? <AdminText muted>{t('admEmpty')}</AdminText> : null}
      {data && data.total > data.pageSize ? (
        <>
          <AdminText muted>{`${t('admShowing')} ${from}–${to} ${t('admOf')} ${data.total}`}</AdminText>
          <View style={styles.pages}>
            <Button variant="outline" size="sm" disabled={page <= 1} onPress={() => setPage(page - 1)}>
              {t('admPagePrev')}
            </Button>
            <Button variant="outline" size="sm" disabled={to >= data.total} onPress={() => setPage(page + 1)}>
              {t('admPageNext')}
            </Button>
          </View>
        </>
      ) : null}
    </AdminScreen>
  )
}

const styles = StyleSheet.create({
  actions: { gap: 8, marginTop: 4 },
  pages: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 },
})
