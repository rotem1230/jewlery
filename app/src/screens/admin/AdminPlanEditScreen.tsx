import { useEffect, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { createAdminPlan, listAdminPlans, listPlanFeatures, updateAdminPlan } from '@/src/api/admin'
import { AdminCard, AdminChips, AdminScreen, AdminText, AdminTitle } from '@/src/components/admin/AdminLayout'
import { Button } from '@/src/components/ui/Button'
import { Field } from '@/src/components/ui/Field'
import { Toggle } from '@/src/components/ui/Toggle'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { EMPTY_PLAN_FORM, formToPlanPayload, planToForm, type PlanForm } from '@/src/lib/admin'
import { parseApiError } from '@/src/lib/api'
import type { ProfileStackParamList } from '@/src/navigation/types'
import { useTranslation } from '@/src/i18n'

/** Editing a plan (or creating one): name, cycle, price, trial, quotas, features, what it includes. */
export function AdminPlanEditScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation()
  const { params } = useRoute<RouteProp<ProfileStackParamList, 'AdminPlanEdit'>>()
  const editing = params?.code ?? null
  const plans = useAsyncData((signal) => listAdminPlans(signal), { immediate: Boolean(editing) })
  const features = useAsyncData((signal) => listPlanFeatures(signal))
  const plan = editing ? plans.data?.find((item) => item.code === editing) ?? null : null
  const [form, setForm] = useState<PlanForm | null>(editing ? null : EMPTY_PLAN_FORM)
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof PlanForm | 'code', string>>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (plan && !form) setForm(planToForm(plan))
  }, [plan, form])

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((current) => (current ? { ...current, [key]: value } : current))

  const save = async () => {
    if (!form) return
    const { payload, errors: problems } = formToPlanPayload(form)
    const codeProblem = !editing && !/^[A-Z][A-Z0-9_]{2,49}$/.test(code.trim()) ? { code: t('admFieldCode') } : {}
    if (!payload || Object.keys(codeProblem).length > 0) {
      setErrors({ ...problems, ...codeProblem })
      return
    }
    setErrors({})
    setBusy(true)
    try {
      if (editing) await updateAdminPlan(editing, payload)
      else await createAdminPlan({ ...payload, code: code.trim(), role: params?.role ?? 'DESIGNER' })
      Alert.alert(t('admPlans'), t('admSaved'))
      navigation.goBack()
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const title = editing ? (plan?.nameHe ?? editing) : t('admNewPlan')
  return (
    <AdminScreen title={title} loading={(editing ? plans.loading : false) || !form} error={plans.error} onRetry={plans.retry}>
      {form ? (
        <>
          <AdminCard>
            {!editing ? <Field label={t('admFieldCode')} value={code} onChangeText={(text) => setCode(text.toUpperCase())} autoCapitalize="characters" error={errors.code} /> : null}
            <Field label={t('admFieldNameHe')} value={form.nameHe} onChangeText={(text) => set('nameHe', text)} error={errors.nameHe} />
            <Field label={t('admFieldNameEn')} value={form.nameEn} onChangeText={(text) => set('nameEn', text)} />
            <AdminText muted>{t('admFieldCycle')}</AdminText>
            <AdminChips
              options={[
                { key: 'MONTHLY', label: t('admCycleMonthly') },
                { key: 'QUARTERLY', label: t('admCycleQuarterly') },
                { key: 'ANNUAL', label: t('admCycleAnnual') },
              ]}
              value={form.billingCycle}
              onChange={(cycle) => set('billingCycle', cycle)}
            />
            <Field label={t('admFieldPrice')} value={form.price} onChangeText={(text) => set('price', text)} keyboardType="decimal-pad" error={errors.price} />
            <AdminText muted>{t('admPriceNote')}</AdminText>
            <Field label={t('admFieldTrial')} value={form.trialDays} onChangeText={(text) => set('trialDays', text)} keyboardType="number-pad" error={errors.trialDays} />
            <Field label={t('admFieldLeads')} value={form.leadQuota} onChangeText={(text) => set('leadQuota', text)} keyboardType="number-pad" error={errors.leadQuota} />
            <Field label={t('admFieldAi')} value={form.aiRenders} onChangeText={(text) => set('aiRenders', text)} keyboardType="number-pad" error={errors.aiRenders} />
            <Toggle value={form.unlimited} onChange={(value) => set('unlimited', value)} label={t('admFieldUnlimited')} />
            <Toggle value={form.isActive} onChange={(value) => set('isActive', value)} label={t('admFieldActive')} />
          </AdminCard>
          <AdminCard>
            <AdminTitle>{t('admFieldFeatures')}</AdminTitle>
            {(features.data ?? []).map((feature) => (
              <Toggle
                key={feature.key}
                value={form.features.includes(feature.key)}
                onChange={(on) => set('features', on ? [...form.features, feature.key] : form.features.filter((key) => key !== feature.key))}
                label={feature.description}
              />
            ))}
          </AdminCard>
          <AdminCard>
            <Field label={t('admFieldBullets')} value={form.bulletsHe} onChangeText={(text) => set('bulletsHe', text)} multiline style={styles.multiline} />
          </AdminCard>
          <View>
            <Button variant="primary" fullWidth disabled={busy} onPress={() => void save()}>
              {t('admSave')}
            </Button>
          </View>
        </>
      ) : null}
    </AdminScreen>
  )
}

const styles = StyleSheet.create({
  multiline: { minHeight: 96, textAlignVertical: 'top' },
})
