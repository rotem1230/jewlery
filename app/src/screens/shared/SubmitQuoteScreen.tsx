import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { ClientInfoCard } from '@/src/components/jeweler/ClientInfoCard'
import { DesignSummaryCard } from '@/src/components/jeweler/DesignSummaryCard'
import { QuoteFormCard, type QuoteFormValues } from '@/src/components/jeweler/QuoteFormCard'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { listAtelierDesigns } from '@/src/api/atelier'
import { getPublicUser } from '@/src/api/auth'
import { createConversation } from '@/src/api/chat'
import { createQuote, getQuote, updateQuote } from '@/src/api/quotes'
import { parseApiError } from '@/src/lib/api'
import { displayName, imageFromUpload } from '@/src/lib/format'
import { specsFromParameters } from '@/src/lib/designSpecs'
import { parseNonNegativeNumber } from '@/src/lib/validation'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation } from '@/src/i18n'
import type { AtelierStackParamList, JewelerTabParamList } from '@/src/navigation/types'
import heroRing from '../../../assets/images/home/hero-ring.png'

type Nav = NativeStackNavigationProp<AtelierStackParamList, 'SubmitQuote'>
type Route = RouteProp<AtelierStackParamList, 'SubmitQuote'>
type TabNav = BottomTabNavigationProp<JewelerTabParamList>

const EMPTY_FORM: QuoteFormValues = {
  materialsCost: '',
  laborCost: '',
  hoursWorked: '',
  deliveryDays: 7,
}

export function SubmitQuoteScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const route = useRoute<Route>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<QuoteFormValues>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<{
    materialsCost?: string
    laborCost?: string
    hoursWorked?: string
  }>({})

  const load = useCallback(
    async (signal: AbortSignal) => {
      const existing = route.params.quoteId
        ? await getQuote(route.params.quoteId, signal).catch(() => null)
        : null
      const page = await listAtelierDesigns({ page: 1 }, signal)
      const design =
        page.items.find((item) => item.id === route.params.designId) ??
        (await listAtelierDesigns({ page: 1 }, signal).then((res) =>
          res.items.find((item) => item.id === route.params.designId),
        ))
      if (!design) return existing ? { design: null, owner: null, quote: existing } : null
      const owner = await getPublicUser(design.ownerUserId, signal).catch(() => null)
      return { design, owner, quote: existing }
    },
    [route.params.designId, route.params.quoteId],
  )
  const { data, loading, error, retry } = useAsyncData(load, {
    deps: [accessToken, route.params.designId, route.params.quoteId],
  })

  const design = data?.design
  const owner = data?.owner
  const existingQuote = data?.quote
  const specs = useMemo(
    () => specsFromParameters(design?.parameters, design?.itemType?.labelHe),
    [design],
  )

  const initialValues = useMemo<QuoteFormValues | undefined>(() => {
    if (!existingQuote) return undefined
    return {
      materialsCost: String(existingQuote.materialsCost ?? ''),
      laborCost: String(existingQuote.laborCost ?? ''),
      hoursWorked:
        existingQuote.laborHours != null && existingQuote.laborHours !== ''
          ? String(existingQuote.laborHours)
          : '',
      deliveryDays: existingQuote.etaBusinessDays || 7,
    }
  }, [existingQuote])

  useEffect(() => {
    if (initialValues) setForm(initialValues)
  }, [initialValues])

  const onSubmit = async () => {
    if (!design && !existingQuote) return
    const materials = parseNonNegativeNumber(form.materialsCost)
    const labor = parseNonNegativeNumber(form.laborCost)
    const hoursRaw = form.hoursWorked.trim()
    const hours = hoursRaw ? parseNonNegativeNumber(form.hoursWorked) : 0
    const next: typeof formErrors = {}
    if (materials == null) next.materialsCost = t('quoteNeedAmount')
    if (labor == null) next.laborCost = t('quoteNeedLabor')
    if (hoursRaw && hours == null) next.hoursWorked = t('validationNumber')
    setFormErrors(next)
    if (next.materialsCost || next.laborCost || next.hoursWorked) return

    const designId = design?.id ?? existingQuote?.designId
    const ownerId = design?.ownerUserId
    if (!designId) return

    setBusy(true)
    try {
      const conversationId =
        route.params.conversationId ??
        existingQuote?.conversationId ??
        (ownerId ? (await createConversation(designId, [ownerId])).id : undefined)
      if (!conversationId) throw new Error('Missing conversation')

      if (existingQuote?.id) {
        await updateQuote(existingQuote.id, {
          materialsCost: materials as number,
          laborCost: labor as number,
          laborHours: hours ?? undefined,
          etaBusinessDays: form.deliveryDays,
        })
      } else {
        await createQuote({
          conversationId,
          designId,
          designRequestId: route.params.requestId,
          materialsCost: materials as number,
          laborCost: labor as number,
          laborHours: hours ?? undefined,
          etaBusinessDays: form.deliveryDays,
        })
      }
      tabNavigation.navigate('Chats', {
        screen: 'ChatThread',
        params: {
          chatId: conversationId,
          title: displayName(owner?.firstName, owner?.lastName),
        },
      })
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const openChat = async () => {
    const designId = design?.id ?? existingQuote?.designId
    const ownerId = design?.ownerUserId
    if (!designId) return
    setBusy(true)
    try {
      const conversationId =
        route.params.conversationId ??
        existingQuote?.conversationId ??
        (ownerId ? (await createConversation(designId, [ownerId])).id : undefined)
      if (!conversationId) return
      tabNavigation.navigate('Chats', {
        screen: 'ChatThread',
        params: {
          chatId: conversationId,
          title: displayName(owner?.firstName, owner?.lastName),
        },
      })
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <HomeHeader onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          {error && !design && !existingQuote && !loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : design || existingQuote ? (
            <>
              {design ? (
                <>
                  <ClientInfoCard
                    title={t('jewelerOrderDetailClientTitle')}
                    nameLabel={t('jewelerOrderDetailClientNameLabel')}
                    name={displayName(owner?.firstName, owner?.lastName, t('designer'))}
                    phoneLabel={t('jewelerOrderDetailClientPhoneLabel')}
                    phone={owner?.email ?? '—'}
                    dateLabel={t('jewelerOrderDetailClientDateLabel')}
                    date={
                      design.publishedAt
                        ? new Date(design.publishedAt).toLocaleDateString('he-IL')
                        : ''
                    }
                  />

                  <DesignSummaryCard
                    sectionTitle={t('jewelerOrderDetailDesignTitle')}
                    image={imageFromUpload(design.thumbnailUploadId, heroRing)}
                    title={design.title || t('jewelerOrderDetailDesignHeadline')}
                    quote={design.description || ''}
                    specs={specs}
                  />
                </>
              ) : null}

              <QuoteFormCard
                key={existingQuote?.id ?? 'new'}
                title={t('jewelerQuoteFormTitle')}
                materialsCostLabel={t('jewelerQuoteMaterialsCostLabel')}
                laborCostLabel={t('jewelerQuoteLaborCostLabel')}
                hoursWorkedLabel={t('jewelerQuoteHoursLabel')}
                deliveryTimeLabel={t('jewelerQuoteDeliveryLabel')}
                deliveryDaysUnit={(days) =>
                  t('jewelerQuoteDeliveryDaysUnit').replace('{{days}}', String(days))
                }
                totalLabel={t('jewelerQuoteTotalLabel')}
                currencySymbol="₪"
                initialValues={initialValues}
                errors={formErrors}
                onChange={(values) => {
                  setForm(values)
                  setFormErrors({})
                }}
              />

              <BrandButton
                label={t('jewelerQuoteSubmitCta')}
                variant="primary"
                flex={false}
                disabled={busy}
                onPress={() => void onSubmit()}
              />
              <BrandButton
                label={t('jewelerOrderDetailGoToChat')}
                variant="outline"
                flex={false}
                disabled={busy}
                onPress={() => void openChat()}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF3FA' },
  flex: { flex: 1 },
  content: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  column: { width: '100%', maxWidth: 343, gap: 20 },
})
