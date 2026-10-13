import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { ClientInfoCard } from '@/src/components/jeweler/ClientInfoCard'
import { DesignSummaryCard } from '@/src/components/jeweler/DesignSummaryCard'
import { QuoteFormCard } from '@/src/components/jeweler/QuoteFormCard'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { getAtelierDesign } from '@/src/api/atelier'
import { getPublicUser } from '@/src/api/auth'
import { createConversation } from '@/src/api/chat'
import { createQuote, getQuote, updateQuote, withdrawQuote } from '@/src/api/quotes'
import { parseApiError } from '@/src/lib/api'
import { isNotFound, listingExpiry } from '@/src/lib/atelierView'
import { currencySymbol, displayName, imageFromUpload } from '@/src/lib/format'
import { jewelerErrorKey, shouldReload, type JewelerAction } from '@/src/lib/jewelerErrors'
import { designSpecRows } from '@/src/lib/jewelerOrders'
import {
  quoteFormFromQuote,
  readQuoteForm,
  type QuoteFormErrors,
  type QuoteFormValues,
} from '@/src/lib/quoteForm'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation } from '@/src/i18n'
import type { AtelierDesign } from '@/src/types/api'
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
  notes: '',
}

/**
 * Price a listed design, or edit / withdraw the jeweler's own pending quote on it (PRD 5.6).
 * The design is loaded by id; once its listing is no longer live the form is not offered.
 */
export function SubmitQuoteScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const route = useRoute<Route>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<QuoteFormValues>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<QuoteFormErrors>({})

  const load = useCallback(
    async (signal: AbortSignal) => {
      // Not swallowed: a quote that failed to load must not turn an edit into a second quote.
      const quote = route.params.quoteId ? await getQuote(route.params.quoteId, signal) : null
      let design: AtelierDesign | null = null
      try {
        design = await getAtelierDesign(route.params.designId, signal)
      } catch (err) {
        // 404: the listing ended (expired, completed, unpublished or removed).
        if (!isNotFound(err)) throw err
      }
      const owner = design ? await getPublicUser(design.ownerUserId, signal).catch(() => null) : null
      return { design, owner, quote }
    },
    [route.params.designId, route.params.quoteId],
  )
  const { data, loading, error, retry } = useAsyncData(load, {
    deps: [accessToken, route.params.designId, route.params.quoteId],
  })

  const design = data?.design ?? null
  const owner = data?.owner ?? null
  const existingQuote = data?.quote ?? null
  const editable = existingQuote?.status === 'PENDING'
  const specs = useMemo(() => designSpecRows(design), [design])
  const expiry = listingExpiry(design?.expiresAt, locale)

  const initialValues = useMemo<QuoteFormValues | undefined>(
    () => (existingQuote && editable ? quoteFormFromQuote(existingQuote) : undefined),
    [existingQuote, editable],
  )

  useEffect(() => {
    if (initialValues) setForm(initialValues)
  }, [initialValues])

  const showError = (err: unknown, action: JewelerAction) => {
    const key = jewelerErrorKey(err, action)
    Alert.alert(t('authErrorTitle'), key ? t(key) : parseApiError(err))
    // The designer changed the design, the listing ended, or the quote was decided meanwhile:
    // reload so the jeweler reviews what is current before pricing again.
    if (shouldReload(err)) retry()
  }

  const conversationFor = async (designId: string, ownerId?: string) =>
    route.params.conversationId ??
    existingQuote?.conversationId ??
    (ownerId ? (await createConversation(designId, [ownerId])).id : undefined)

  const goToChat = (conversationId: string) =>
    tabNavigation.navigate('Chats', {
      screen: 'ChatThread',
      params: { chatId: conversationId, title: displayName(owner?.firstName, owner?.lastName) },
    })

  const onSubmit = async () => {
    if (!design) return
    const read = readQuoteForm(form)
    if (!read.ok) {
      setFormErrors(read.errors)
      return
    }
    setFormErrors({})
    const { values } = read
    setBusy(true)
    try {
      const conversationId = await conversationFor(design.id, design.ownerUserId)
      if (!conversationId) throw new Error('Missing conversation')
      if (existingQuote && editable) {
        await updateQuote(existingQuote.id, {
          materialsCost: values.materialsCost,
          laborCost: values.laborCost,
          // Cleared hours are saved as 0 (the server keeps a missing field unchanged).
          laborHours: values.laborHours ?? 0,
          etaBusinessDays: values.etaBusinessDays,
          notes: values.notes,
        })
      } else {
        await createQuote({
          conversationId,
          designId: design.id,
          designRequestId: route.params.requestId,
          materialsCost: values.materialsCost,
          laborCost: values.laborCost,
          laborHours: values.laborHours,
          etaBusinessDays: values.etaBusinessDays,
          notes: values.notes || undefined,
        })
      }
      goToChat(conversationId)
    } catch (err) {
      showError(err, 'quote')
    } finally {
      setBusy(false)
    }
  }

  const openChat = async () => {
    const designId = design?.id ?? existingQuote?.designId
    if (!designId) return
    setBusy(true)
    try {
      const conversationId = await conversationFor(designId, design?.ownerUserId)
      if (conversationId) goToChat(conversationId)
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    if (!existingQuote) return
    setBusy(true)
    try {
      await withdrawQuote(existingQuote.id)
      Alert.alert(t('jwWithdrawDone'))
      navigation.goBack()
    } catch (err) {
      showError(err, 'withdraw')
    } finally {
      setBusy(false)
    }
  }

  const confirmWithdraw = () =>
    Alert.alert(t('jwWithdrawConfirmTitle'), t('jwWithdrawConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('jwWithdrawCta'), style: 'destructive', onPress: () => withdraw() },
    ])

  const withdrawButton = editable ? (
    <BrandButton
      label={t('jwWithdrawCta')}
      variant="outline"
      flex={false}
      disabled={busy}
      onPress={confirmWithdraw}
    />
  ) : null

  const renderBody = () => {
    if (error && !data && !loading) {
      return (
        <ErrorState
          title={t('commonLoadingErrorTitle')}
          message={t('commonLoadingErrorMessage')}
          retryLabel={t('commonRetry')}
          onRetry={retry}
        />
      )
    }
    if (!data) return null
    if (existingQuote && !editable) {
      // Accepted, declined, withdrawn or expired meanwhile: there is nothing left to edit here.
      return (
        <ErrorState
          title={t('jwQuoteNotPending')}
          retryLabel={t('jwBack')}
          onRetry={() => navigation.goBack()}
        />
      )
    }
    if (!design) {
      return (
        <>
          <ErrorState
            title={t('jwListingUnavailableTitle')}
            message={t('jwListingUnavailableMessage')}
            retryLabel={t('jwBack')}
            onRetry={() => navigation.goBack()}
          />
          {/* A pending quote on an ended listing can still be taken back. */}
          {withdrawButton}
        </>
      )
    }
    return (
      <>
        <ClientInfoCard
          title={t('jewelerOrderDetailClientTitle')}
          nameLabel={t('jewelerOrderDetailClientNameLabel')}
          name={displayName(owner?.firstName, owner?.lastName, t('designer'))}
          dateLabel={t('jewelerOrderDetailClientDateLabel')}
          date={
            design.publishedAt
              ? new Date(design.publishedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB')
              : ''
          }
        />

        <DesignSummaryCard
          sectionTitle={t('jewelerOrderDetailDesignTitle')}
          image={imageFromUpload(design.thumbnailUploadId, heroRing)}
          title={design.title || design.itemType?.labelHe || t('jwUntitledDesign')}
          details={
            expiry
              ? [t(expiry.expired ? 'jwExpiredOn' : 'jwValidUntil').replace('{{date}}', expiry.date)]
              : undefined
          }
          quote={design.description || ''}
          specs={specs}
        />

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
          notesLabel={t('jwQuoteNotesLabel')}
          notesPlaceholder={t('jwQuoteNotesPlaceholder')}
          totalLabel={t('jewelerQuoteTotalLabel')}
          currencySymbol={currencySymbol(existingQuote?.currency)}
          initialValues={initialValues}
          errors={{
            materialsCost: formErrors.materialsCost && t(formErrors.materialsCost),
            laborCost: formErrors.laborCost && t(formErrors.laborCost),
            hoursWorked: formErrors.hoursWorked && t(formErrors.hoursWorked),
            notes: formErrors.notes && t(formErrors.notes),
          }}
          onChange={(values) => {
            setForm(values)
            setFormErrors({})
          }}
        />

        <BrandButton
          label={t('jewelerQuoteSubmitCta')}
          variant="primary"
          flex={false}
          disabled={busy || (expiry?.expired ?? false)}
          onPress={() => void onSubmit()}
        />
        <BrandButton
          label={t('jewelerOrderDetailGoToChat')}
          variant="outline"
          flex={false}
          disabled={busy}
          onPress={() => void openChat()}
        />
        {withdrawButton}
      </>
    )
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
        <View style={styles.column}>{renderBody()}</View>
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
