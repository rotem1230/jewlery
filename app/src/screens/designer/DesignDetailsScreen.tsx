import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { ChevronDown, ChevronUp } from 'lucide-react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { DesignDetailsCard } from '@/src/components/designs/DesignDetailsCard'
import { QuoteOfferCard } from '@/src/components/designs/QuoteOfferCard'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { Field } from '@/src/components/ui/Field'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { PublishSuccessModal } from '@/src/components/ui/PublishSuccessModal'
import { ChatImageViewer } from '@/src/components/chats/ChatImageViewer'
import {
  deleteDesign,
  duplicateDesign,
  getDesign,
  listDesignQuotes,
  transitionDesign,
  updateDesign,
} from '@/src/api/designs'
import { listMetals, listRegions, metalChoices, parseMetalChoice } from '@/src/api/masterData'
import { parseApiError } from '@/src/lib/api'
import { designPicture } from '@/src/lib/designPicture'
import { viewInAtelierTarget } from '@/src/lib/atelierView'
import { specsFromDesign } from '@/src/lib/designSpecs'
import {
  completedByLabel,
  designActions,
  designDisplayTitle,
  designErrorMessage,
  listingExpiryLabel,
  regionOptions,
  regionPatchForPublish,
} from '@/src/lib/designActions'
import { previousQuoteRows } from '@/src/lib/quoteStatus'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, spacing } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import { FilterOptionsSheet } from '@/src/components/chats/FilterOptionsSheet'
import type { DesignerTabParamList, MyDesignsStackParamList } from '@/src/navigation/types'

type Nav = NativeStackNavigationProp<MyDesignsStackParamList, 'DesignDetails'>
type TabNav = BottomTabNavigationProp<DesignerTabParamList>
type Route = RouteProp<MyDesignsStackParamList, 'DesignDetails'>

export function DesignDetailsScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const route = useRoute<Route>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [quotesOpen, setQuotesOpen] = useState(true)
  const [publishSuccessOpen, setPublishSuccessOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [titleError, setTitleError] = useState<string>()
  const [viewerUri, setViewerUri] = useState<string | null>(null)
  const [metalId, setMetalId] = useState('YELLOW_GOLD:14K')
  const [metalOpen, setMetalOpen] = useState(false)
  const [regionOpen, setRegionOpen] = useState(false)

  const load = useCallback(
    (signal: AbortSignal) => getDesign(route.params.designId, signal),
    [route.params.designId],
  )
  const { data: design, loading, error, retry, refresh } = useAsyncData(load, {
    deps: [accessToken, route.params.designId],
  })
  const quotesQuery = useAsyncData(
    (signal) => listDesignQuotes(route.params.designId, signal),
    { deps: [accessToken, route.params.designId] },
  )
  // Back from the studio (or another tab) the design may have changed: reload it in the
  // background, keeping what is shown until the fresh answer replaces it. The first focus is the
  // initial load itself.
  const focusedOnce = useRef(false)
  const refreshQuotes = quotesQuery.refresh
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) {
        void refresh()
        void refreshQuotes()
      }
      focusedOnce.current = true
    }, [refresh, refreshQuotes]),
  )
  const metalsQuery = useAsyncData((signal) => listMetals(signal), { deps: [] })
  const regionsQuery = useAsyncData((signal) => listRegions(signal), { deps: [] })
  const metalOptions = metalChoices(metalsQuery.data ?? [], locale)
  const regions = regionsQuery.data ?? []

  const status = design?.status ?? 'DRAFT'
  const actions = designActions({ status, completedBy: design?.completedBy })
  const quoteRows = previousQuoteRows(quotesQuery.data ?? [], locale)
  const showQuotes = status !== 'DRAFT' || quoteRows.length > 0
  const specs = design ? specsFromDesign(design) : []
  const picture = designPicture(design)
  const quoteCount = quotesQuery.data ? quoteRows.length : design?.quoteCount ?? 0
  const completedBy = design ? completedByLabel(design, locale) : null
  const expiry = status === 'PUBLISHED' ? listingExpiryLabel(design?.expiresAt, locale) : null
  const region = regions.find((item) => item.id === design?.preferredRegionId)
  const regionLabel = region ? (locale === 'en' && region.labelEn ? region.labelEn : region.labelHe) : null

  const showError = (message: { title: string; body: string }) => Alert.alert(message.title, message.body)

  const runTransition = async (toStatus: 'ARCHIVED' | 'DRAFT') => {
    if (!design) return
    setBusy(true)
    try {
      await transitionDesign(design.id, toStatus)
      await refresh()
    } catch (err) {
      showError(designErrorMessage(err, 'save', locale))
    } finally {
      setBusy(false)
    }
  }

  // Publishing (PRD 5.5): the preferred region chosen in the sheet is saved first, so the Atelier
  // region filter finds the design; "no preference" publishes as it is.
  const publish = async (regionId: string) => {
    if (!design) return
    setBusy(true)
    try {
      const patch = regionPatchForPublish(design, regionId)
      if (patch) await updateDesign(design.id, patch)
      await transitionDesign(design.id, 'PUBLISHED')
      await refresh()
      setPublishSuccessOpen(true)
    } catch (err) {
      await refresh()
      showError(designErrorMessage(err, 'publish', locale))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = () => {
    if (!design) return
    setTitle(design.title ?? '')
    setDescription(design.description ?? '')
    setTitleError(undefined)
    const metal = design.parameters?.metal
    if (metal && typeof metal === 'object') {
      const record = metal as Record<string, unknown>
      const code = typeof record.metalCode === 'string' ? record.metalCode : 'YELLOW_GOLD'
      const purity = typeof record.purityCode === 'string' ? record.purityCode : '14K'
      setMetalId(`${code}:${purity}`)
    }
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!design) return
    if (!title.trim()) {
      setTitleError(t('designTitleRequired'))
      return
    }
    setBusy(true)
    try {
      await updateDesign(design.id, {
        version: design.version,
        title: title.trim(),
        description: description.trim() || undefined,
        parameters: {
          ...design.parameters,
          metal: parseMetalChoice(metalId),
        },
      })
      setEditing(false)
      await refresh()
    } catch (err) {
      showError(designErrorMessage(err, 'save', locale))
    } finally {
      setBusy(false)
    }
  }

  const onDuplicate = async () => {
    if (!design) return
    setBusy(true)
    try {
      const copy = await duplicateDesign(design.id)
      navigation.replace('DesignDetails', { designId: copy.id })
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  // Client notes of 25.11: a design started by mistake, or on the wrong piece, can be deleted.
  const onDelete = () => {
    if (!design) return
    Alert.alert(t('designDeleteConfirmTitle'), t('designDeleteConfirmBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('designDeleteCta'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true)
            try {
              await deleteDesign(design.id)
              navigation.goBack()
            } catch (err) {
              showError(designErrorMessage(err, 'delete', locale))
            } finally {
              setBusy(false)
            }
          })()
        },
      },
    ])
  }

  const openStudio = () => {
    if (!design) return
    tabNavigation?.navigate('Home', { screen: 'DesignStudio', initial: false, params: { designId: design.id } })
  }

  const closePublishSuccess = () => setPublishSuccessOpen(false)

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('designDetails')} onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {error && !design && !loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : design ? (
            <>
              <DesignDetailsCard
                sectionTitle={t('designDetailsShort')}
                image={picture.source}
                imageResizeMode={picture.resizeMode}
                title={designDisplayTitle(design, locale)}
                quote={design.description || ''}
                specs={specs}
                onMaximize={picture.uri ? () => setViewerUri(picture.uri ?? null) : undefined}
              />

              {completedBy || expiry || regionLabel ? (
                <View style={styles.facts}>
                  {completedBy ? <Text style={styles.fact}>{completedBy}</Text> : null}
                  {expiry ? <Text style={styles.fact}>{expiry}</Text> : null}
                  {regionLabel ? (
                    <Text style={styles.fact}>{`${t('dzPreferredRegion')} ${regionLabel}`}</Text>
                  ) : null}
                </View>
              ) : null}

              {editing ? (
                <View style={styles.editForm}>
                  <Field
                    label={t('dzDesignNameLabel')}
                    value={title}
                    error={titleError}
                    onChangeText={(value) => {
                      setTitle(value)
                      setTitleError(undefined)
                    }}
                  />
                  <View>
                    <Text style={styles.bioLabel}>{t('businessProfileBioLabel')}</Text>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      textAlign="right"
                      style={styles.bioInput}
                    />
                  </View>
                  {metalOptions.length > 0 ? (
                    <View>
                      <Text style={styles.bioLabel}>{t('designMetalLabel')}</Text>
                      <BrandButton
                        label={
                          metalOptions.find((choice) => choice.id === metalId)?.label ??
                          t('designMetalLabel')
                        }
                        variant="outline"
                        flex={false}
                        onPress={() => setMetalOpen(true)}
                      />
                    </View>
                  ) : null}
                  <BrandButton
                    label={t('designSaveCta')}
                    variant="primary"
                    flex={false}
                    disabled={busy}
                    onPress={() => void saveEdit()}
                  />
                  <BrandButton
                    label={t('cancel')}
                    variant="outline"
                    flex={false}
                    disabled={busy}
                    onPress={() => setEditing(false)}
                  />
                </View>
              ) : (
                <View style={styles.actions}>
                  {actions.editInStudio ? (
                    <BrandButton
                      label={t('studioEditInStudio')}
                      variant="outline"
                      flex={false}
                      onPress={openStudio}
                    />
                  ) : null}
                  {actions.viewInStudio ? (
                    <BrandButton
                      label={t('dzViewInStudio')}
                      variant="outline"
                      flex={false}
                      onPress={openStudio}
                    />
                  ) : null}
                  {actions.publish ? (
                    <BrandButton
                      label={t('publishMarketplace')}
                      variant="primary"
                      flex={false}
                      disabled={busy}
                      onPress={() => setRegionOpen(true)}
                    />
                  ) : null}
                  {actions.editDetails ? (
                    <BrandButton
                      label={t('editDesign')}
                      variant="outline"
                      flex={false}
                      onPress={startEdit}
                    />
                  ) : null}
                  {actions.archive || actions.orderJewelers ? (
                    <View style={styles.actionRow}>
                      {actions.archive ? (
                        <View style={styles.actionSlot}>
                          <BrandButton
                            label={t('moveToArchive')}
                            variant="outline"
                            flex={false}
                            disabled={busy}
                            onPress={() => void runTransition('ARCHIVED')}
                          />
                        </View>
                      ) : null}
                      {actions.orderJewelers ? (
                        <View style={styles.actionSlot}>
                          <BrandButton
                            label={t('orderJewelers')}
                            variant="outline"
                            flex={false}
                            onPress={() => tabNavigation?.navigate('Atelier')}
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {actions.moveToDrafts ? (
                    <BrandButton
                      label={t('moveBackToDrafts')}
                      variant="outline"
                      flex={false}
                      disabled={busy}
                      onPress={() => void runTransition('DRAFT')}
                    />
                  ) : null}
                  <BrandButton
                    label={t('designDuplicateCta')}
                    variant="outline"
                    flex={false}
                    disabled={busy}
                    onPress={() => void onDuplicate()}
                  />
                  {actions.remove ? (
                    <BrandButton
                      label={t('designDeleteCta')}
                      variant="outline"
                      flex={false}
                      disabled={busy}
                      onPress={onDelete}
                    />
                  ) : null}
                </View>
              )}

              {showQuotes ? (
                <View style={styles.quotes}>
                  <Pressable
                    style={styles.quotesHeader}
                    accessibilityRole="button"
                    onPress={() => setQuotesOpen((open) => !open)}
                  >
                    {quotesOpen ? (
                      <ChevronUp size={20} color={colors.ink} strokeWidth={1.67} />
                    ) : (
                      <ChevronDown size={20} color={colors.ink} strokeWidth={1.67} />
                    )}
                    <Text style={styles.quotesTitle}>
                      {t('priceQuotesTitle').replace('{{count}}', String(quoteCount))}
                    </Text>
                  </Pressable>
                  {quotesOpen ? (
                    quoteRows.length > 0 ? (
                      <View style={styles.quoteCards}>
                        {quoteRows.map((row) => (
                          <QuoteOfferCard
                            key={row.id}
                            name={row.jeweler}
                            role={t('jeweler')}
                            priceLabel={t('quotePriceLabel')}
                            priceValue={row.total}
                            deliveryLabel={t('quoteDeliveryLabel')}
                            deliveryValue={t('quoteDeliveryValue').replace('{{days}}', String(row.etaDays))}
                            dateLabel={t('dzQuoteDateLabel')}
                            dateValue={row.date}
                            statusLabel={t('dzQuoteStatusLabel')}
                            statusValue={row.statusLabel}
                            ctaLabel={t('dzQuoteDetailsCta')}
                            onPress={() =>
                              tabNavigation?.navigate('Chats', {
                                screen: 'QuoteDetails',
                                initial: false,
                                params: { quoteId: row.id, chatId: row.conversationId },
                              })
                            }
                          />
                        ))}
                      </View>
                    ) : quotesQuery.error && !quotesQuery.loading ? (
                      <ErrorState
                        title={t('commonLoadingErrorTitle')}
                        message={t('commonLoadingErrorMessage')}
                        retryLabel={t('commonRetry')}
                        onRetry={quotesQuery.retry}
                      />
                    ) : quotesQuery.loading ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <Text style={styles.quotesHint}>{t('dzQuotesEmpty')}</Text>
                    )
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <PublishSuccessModal
        visible={publishSuccessOpen}
        title={t('publishSuccessTitle')}
        message={t('publishSuccessMessage')}
        primaryLabel={t('viewInAtelier')}
        secondaryLabel={t('goToHome')}
        onRequestClose={closePublishSuccess}
        onPrimary={() => {
          closePublishSuccess()
          // The atelier's designs, loaded again: the item just published is at the top.
          const [atelier, params] = viewInAtelierTarget()
          tabNavigation?.navigate(atelier, params)
        }}
        onSecondary={() => {
          closePublishSuccess()
          tabNavigation?.navigate('Home')
        }}
      />
      <ChatImageViewer imageUri={viewerUri} onClose={() => setViewerUri(null)} />
      <FilterOptionsSheet
        visible={metalOpen}
        options={metalOptions.map((choice) => ({ id: choice.id, label: choice.label }))}
        onSelect={(option) => {
          setMetalId(option.id)
          setMetalOpen(false)
        }}
        onRequestClose={() => setMetalOpen(false)}
      />
      <FilterOptionsSheet
        visible={regionOpen}
        options={regionOptions(regions, locale)}
        onSelect={(option) => {
          setRegionOpen(false)
          publish(option.id)
        }}
        onRequestClose={() => setRegionOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.homeBg,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 448,
    gap: spacing.xl,
  },
  facts: {
    width: '100%',
    gap: 4,
  },
  fact: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actions: {
    width: '100%',
    gap: spacing.md,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 24,
  },
  actionSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  editForm: {
    width: '100%',
    gap: 12,
  },
  bioLabel: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  bioInput: {
    width: '100%',
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
    writingDirection: 'rtl',
  },
  quotes: {
    width: '100%',
    gap: spacing.xl,
  },
  quotesHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quotesTitle: {
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 22,
    letterSpacing: -0.2,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  quotesHint: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  quoteCards: {
    width: '100%',
    gap: spacing.md,
  },
})
