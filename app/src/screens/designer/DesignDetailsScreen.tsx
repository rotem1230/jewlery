import { useCallback, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
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
import { getDesign, duplicateDesign, transitionDesign, updateDesign } from '@/src/api/designs'
import { listConversations } from '@/src/api/chat'
import { listMetals, metalChoices, parseMetalChoice } from '@/src/api/masterData'
import { parseApiError } from '@/src/lib/api'
import { displayName, formatMoney, imageFromUpload } from '@/src/lib/format'
import { specsFromDesign } from '@/src/lib/designSpecs'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, spacing } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import { FilterOptionsSheet } from '@/src/components/chats/FilterOptionsSheet'
import type { DesignerTabParamList, MyDesignsStackParamList } from '@/src/navigation/types'
import heroRing from '../../../assets/images/home/hero-ring.png'

type Nav = NativeStackNavigationProp<MyDesignsStackParamList, 'DesignDetails'>
type TabNav = BottomTabNavigationProp<DesignerTabParamList>
type Route = RouteProp<MyDesignsStackParamList, 'DesignDetails'>

export function DesignDetailsScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const route = useRoute<Route>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const myUserId = useAppSelector((s) => s.auth.user?.id)
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

  const load = useCallback(
    (signal: AbortSignal) => getDesign(route.params.designId, signal),
    [route.params.designId],
  )
  const { data: design, loading, error, retry, refresh } = useAsyncData(load, {
    deps: [accessToken, route.params.designId],
  })
  const quotesQuery = useAsyncData(
    (signal) => listConversations({ designId: route.params.designId }, signal),
    { deps: [accessToken, route.params.designId] },
  )
  const metalsQuery = useAsyncData((signal) => listMetals(signal), { deps: [] })
  const metalOptions = metalChoices(metalsQuery.data ?? [], locale)

  const variant = (design?.status ?? 'DRAFT').toLowerCase() as
    | 'draft'
    | 'published'
    | 'completed'
    | 'archived'
  const showQuotes = variant === 'published' || variant === 'completed' || variant === 'archived'
  const specs = design ? specsFromDesign(design) : []
  const quoteCount = design?.quoteCount ?? 0

  const runTransition = async (toStatus: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT') => {
    if (!design) return
    setBusy(true)
    try {
      await transitionDesign(design.id, toStatus)
      await refresh()
      if (toStatus === 'PUBLISHED') setPublishSuccessOpen(true)
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
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
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('designSaveFailed'))
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
                image={imageFromUpload(design.thumbnailUploadId, heroRing)}
                title={design.title || t('designDetailsTitle')}
                quote={design.description || ''}
                specs={specs}
                onMaximize={() => {
                  const source = imageFromUpload(design.thumbnailUploadId, heroRing)
                  if (typeof source === 'object' && source && 'uri' in source && source.uri) {
                    setViewerUri(source.uri)
                    return
                  }
                  const resolved = Image.resolveAssetSource(source)
                  if (resolved?.uri) setViewerUri(resolved.uri)
                }}
              />

              {editing ? (
                <View style={styles.editForm}>
                  <Field
                    label={t('designDetailsTitle')}
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
              ) : null}

              {variant === 'draft' && !editing ? (
                <View style={styles.actions}>
                  <BrandButton
                    label={t('studioEditInStudio')}
                    variant="outline"
                    flex={false}
                    onPress={() =>
                      tabNavigation?.navigate('Home', {
                        screen: 'DesignStudio',
                        params: { designId: design.id },
                      })
                    }
                  />
                  <View style={styles.actionRow}>
                    <View style={styles.actionSlot}>
                      <BrandButton
                        label={t('orderJewelers')}
                        variant="outline"
                        flex={false}
                        onPress={() => tabNavigation?.navigate('Atelier')}
                      />
                    </View>
                    <View style={styles.actionSlot}>
                      <BrandButton
                        label={t('publishMarketplace')}
                        variant="primary"
                        flex={false}
                        disabled={busy}
                        onPress={() => void runTransition('PUBLISHED')}
                      />
                    </View>
                  </View>
                  <View style={styles.actionRow}>
                    <View style={styles.actionSlot}>
                      <BrandButton
                        label={t('moveToArchive')}
                        variant="outline"
                        flex={false}
                        disabled={busy}
                        onPress={() => void runTransition('ARCHIVED')}
                      />
                    </View>
                    <View style={styles.actionSlot}>
                      <BrandButton
                        label={t('editDesign')}
                        variant="outline"
                        flex={false}
                        onPress={startEdit}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              {!editing && (variant === 'published' || variant === 'completed') ? (
                <View style={styles.actions}>
                  <BrandButton
                    label={t('studioEditInStudio')}
                    variant="outline"
                    flex={false}
                    onPress={() =>
                      tabNavigation?.navigate('Home', {
                        screen: 'DesignStudio',
                        params: { designId: design.id },
                      })
                    }
                  />
                  <BrandButton
                    label={t('editDesign')}
                    variant="outline"
                    flex={false}
                    onPress={startEdit}
                  />
                  <View style={styles.actionRow}>
                    <View style={styles.actionSlot}>
                      <BrandButton
                        label={t('moveToArchive')}
                        variant="outline"
                        flex={false}
                        disabled={busy}
                        onPress={() => void runTransition('ARCHIVED')}
                      />
                    </View>
                    <View style={styles.actionSlot}>
                      <BrandButton
                        label={t('orderJewelers')}
                        variant="outline"
                        flex={false}
                        onPress={() => tabNavigation?.navigate('Atelier')}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              {variant === 'archived' ? (
                <View style={styles.actions}>
                  <BrandButton
                    label={t('moveBackToDrafts')}
                    variant="outline"
                    flex={false}
                    disabled={busy}
                    onPress={() => void runTransition('DRAFT')}
                  />
                </View>
              ) : null}

              {!editing ? (
                <BrandButton
                  label={t('designDuplicateCta')}
                  variant="outline"
                  flex={false}
                  disabled={busy}
                  onPress={() => void onDuplicate()}
                />
              ) : null}

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
                    quotesQuery.data?.items.length ? (
                      <View style={styles.quoteCards}>
                        {quotesQuery.data.items.map((conv) => {
                          const peer = conv.participants.find((p) => p.userId !== myUserId)?.user
                          const quote = conv.lastMessage?.quote
                          return (
                            <QuoteOfferCard
                              key={conv.id}
                              name={displayName(peer?.firstName, peer?.lastName, t('jeweler'))}
                              role={t('jeweler')}
                              priceLabel={t('quotePriceLabel')}
                              priceValue={quote ? formatMoney(quote.totalPrice) : '—'}
                              deliveryLabel={t('quoteDeliveryLabel')}
                              deliveryValue={
                                quote
                                  ? t('quoteDeliveryValue').replace(
                                      '{{days}}',
                                      String(quote.etaBusinessDays),
                                    )
                                  : '—'
                              }
                              chatLabel={t('goToChat')}
                              onChat={() =>
                                tabNavigation?.navigate('Chats', {
                                  screen: 'ChatThread',
                                  params: {
                                    chatId: conv.id,
                                    title: displayName(peer?.firstName, peer?.lastName),
                                  },
                                })
                              }
                            />
                          )
                        })}
                      </View>
                    ) : (
                      <Text style={styles.quotesHint}>
                        {quoteCount > 0 ? t('chats') : t('commonEmpty')}
                      </Text>
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
          tabNavigation?.navigate('Atelier')
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
