import { useCallback, useMemo, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { StudioViewer } from '@/src/components/studio/StudioViewer'
import { StudioTabBar, type StudioTabId } from '@/src/components/studio/StudioTabBar'
import { StudioSizePanel } from '@/src/components/studio/StudioSizePanel'
import { StudioMetalPanel } from '@/src/components/studio/StudioMetalPanel'
import { StudioSettingPanel } from '@/src/components/studio/StudioSettingPanel'
import { StudioCatalogList } from '@/src/components/studio/StudioCatalogList'
import { StudioInspirationPanel } from '@/src/components/studio/StudioInspirationPanel'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { ChatImageViewer } from '@/src/components/chats/ChatImageViewer'
import { getDesign, lockDesign, updateDesign } from '@/src/api/designs'
import { createInspiration, waitForAiJob } from '@/src/api/ai'
import { createRenderJob, type RenderExportFormat } from '@/src/api/renderJobs'
import { createVisualizationJob } from '@/src/api/visualization'
import {
  CATEGORY_CODE,
  listElements,
  listMetals,
  listSettings,
  listStones,
  listWizardSizeCharts,
} from '@/src/api/masterData'
import { uploadChatFile } from '@/src/api/uploads'
import { mediaUrl } from '@/src/lib/media'
import { pickChatPhoto } from '@/src/lib/chatAttachments'
import { apiErrorCode, isPaywallError, parseApiError } from '@/src/lib/api'
import {
  FALLBACK_ELEMENTS,
  FALLBACK_METALS,
  FALLBACK_STONES,
  STUDIO_MAX_ELEMENTS,
  STUDIO_MAX_STONES,
  WRIST_MAX_CM,
  WRIST_MIN_CM,
  aiOutputUploadFromParameters,
  elementsFromParameters,
  inspirationUploadFromParameters,
  isNecklaceLength,
  markersFromCatalog,
  metalFromParameters,
  metalHexFromCode,
  noteFromParameters,
  placementForIndex,
  scaleFromSize,
  settingCodeFromParameters,
  sizeFromParameters,
  sizePayload,
  stonesFromParameters,
  tubeFromBandWidthMm,
  type StudioElement,
  type StudioMetal,
  type StudioSize,
  type StudioStone,
} from '@/src/lib/studioParams'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'
import type { DesignerTabParamList, HomeStackParamList, JewelryCategory } from '@/src/navigation/types'
import type { DesignDetail } from '@/src/types/api'

type Nav = NativeStackNavigationProp<HomeStackParamList, 'DesignStudio'>
type TabNav = BottomTabNavigationProp<DesignerTabParamList>
type Route = RouteProp<HomeStackParamList, 'DesignStudio'>

const TAB_TITLE: Record<StudioTabId, TranslationKey> = {
  size: 'studioTabSize',
  metal: 'studioTabMetal',
  setting: 'studioTabSetting',
  stone: 'studioTabStone',
  elements: 'studioTabElements',
  inspiration: 'studioTabInspiration',
}

function itemTypeCode(code: string | undefined): 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS' {
  if (code === 'NECKLACE' || code === 'BRACELET' || code === 'EARRINGS' || code === 'RING') return code
  return CATEGORY_CODE.ring
}

function jewelryCategory(code: string | undefined): JewelryCategory {
  if (code === 'NECKLACE') return 'necklace'
  if (code === 'BRACELET') return 'bracelet'
  if (code === 'EARRINGS') return 'earrings'
  return 'ring'
}

/**
 * Figma 3D wizard: local catalog/AI GLB + six live tabs. PATCH parameters on סיימתי.
 * Inspiration generate is the only path that creates an AI job.
 */
export function DesignStudioScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const route = useRoute<Route>()
  const insets = useSafeAreaInsets()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [tab, setTab] = useState<StudioTabId | null>(null)
  const [sizeDraft, setSizeDraft] = useState<StudioSize | null>(null)
  const [metalDraft, setMetalDraft] = useState<StudioMetal | null>(null)
  const [settingDraft, setSettingDraft] = useState<string | null>(null)
  const [stonesDraft, setStonesDraft] = useState<StudioStone[] | null>(null)
  const [elementsDraft, setElementsDraft] = useState<StudioElement[] | null>(null)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [jewelerNotesDraft, setJewelerNotesDraft] = useState<string | null>(null)
  const [inspirationUploadDraft, setInspirationUploadDraft] = useState<string | null>(null)
  /** Signed link of a model generated in this session (the saved design carries aiOutputUrl). */
  const [aiModelLink, setAiModelLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)

  const load = useCallback(
    (signal: AbortSignal) => getDesign(route.params.designId, signal),
    [route.params.designId],
  )
  const { data: design, error, retry, refresh } = useAsyncData(load, {
    deps: [accessToken, route.params.designId],
  })
  const metalsQuery = useAsyncData((signal) => listMetals(signal), { deps: [] })
  const settingsQuery = useAsyncData((signal) => listSettings(signal), { deps: [] })
  const stonesQuery = useAsyncData((signal) => listStones(signal), { deps: [] })
  const elementsQuery = useAsyncData((signal) => listElements(signal), { deps: [] })
  const chartsQuery = useAsyncData(
    (signal) => listWizardSizeCharts(itemTypeCode(design?.itemType?.code), signal),
    { deps: [design?.itemType?.code], immediate: Boolean(design?.itemType?.code) },
  )

  const parameters = design?.parameters ?? {}
  const itemType = itemTypeCode(design?.itemType?.code)
  const sizeLocked = Boolean(design?.lockedFields?.includes('size'))
  const savedSize = sizeFromParameters(parameters)
  const previewSize = sizeDraft ?? savedSize
  const previewMetal = metalDraft ?? metalFromParameters(parameters)
  const previewSetting = settingDraft ?? settingCodeFromParameters(parameters) ?? undefined
  const previewNote = noteDraft ?? noteFromParameters(parameters)
  const previewJewelerNotes = jewelerNotesDraft ?? design?.jewelerNotes ?? ''
  const previewInspiration = inspirationUploadDraft ?? inspirationUploadFromParameters(parameters)
  const previewAiOutput = aiOutputUploadFromParameters(parameters)
  const aiModelUri = previewAiOutput ? mediaUrl(aiModelLink ?? design?.aiOutputUrl) : undefined
  const markers = useMemo(
    () =>
      markersFromCatalog(
        stonesDraft ?? stonesFromParameters(design?.parameters),
        elementsDraft ?? elementsFromParameters(design?.parameters),
      ),
    [stonesDraft, elementsDraft, design?.parameters],
  )

  const metals =
    (metalsQuery.data ?? []).length > 0 ? (metalsQuery.data ?? []) : FALLBACK_METALS
  const stoneCatalog =
    (stonesQuery.data ?? []).length > 0
      ? (stonesQuery.data ?? []).map((stone) => ({
          code: stone.code,
          label: locale === 'en' && stone.nameEn ? stone.nameEn : stone.nameHe,
        }))
      : FALLBACK_STONES.map((stone) => ({
          code: stone.code,
          label: locale === 'en' ? stone.labelEn : stone.labelHe,
        }))
  const elementCatalog =
    (elementsQuery.data ?? []).length > 0
      ? (elementsQuery.data ?? []).map((element) => ({
          code: element.code,
          label: locale === 'en' && element.labelEn ? element.labelEn : element.labelHe,
        }))
      : FALLBACK_ELEMENTS.map((element) => ({
          code: element.code,
          label: locale === 'en' ? element.labelEn : element.labelHe,
        }))

  const persist = async (next: Record<string, unknown>, extra?: { jewelerNotes?: string }) => {
    if (!design) return null
    setBusy(true)
    try {
      const updated = await updateDesign(design.id, {
        version: design.version,
        parameters: next,
        ...extra,
      })
      await refresh()
      return updated
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('designSaveFailed'))
      return null
    } finally {
      setBusy(false)
    }
  }

  const sizeDraftError = (draft: StudioSize): string | null => {
    if (itemType === 'RING' && !draft.sizeCode) return t('sizeNeedRingSize')
    if (itemType === 'NECKLACE' && !isNecklaceLength(draft.necklaceLengthCm)) return t('studioNeedNecklace')
    if (itemType === 'BRACELET') {
      const wrist = draft.wristCircumferenceCm
      if (wrist == null || wrist < WRIST_MIN_CM || wrist > WRIST_MAX_CM) return t('sizeNeedWrist')
    }
    return null
  }

  const flushDrafts = async (): Promise<boolean> => {
    if (!design) return false
    if (sizeDraft && !sizeLocked) {
      const error = sizeDraftError(sizeDraft)
      if (error) {
        Alert.alert(t('authErrorTitle'), error)
        return false
      }
    }
    const next: Record<string, unknown> = { ...parameters }
    let extra: { jewelerNotes?: string } | undefined
    let dirty = false
    if (sizeDraft && !sizeLocked) {
      next.size = sizePayload(itemType, sizeDraft)
      dirty = true
    }
    if (metalDraft) {
      next.metal = metalDraft
      dirty = true
    }
    if (settingDraft) {
      next.setting = { settingCode: settingDraft }
      dirty = true
    }
    if (stonesDraft) {
      next.stones = stonesDraft
      dirty = true
    }
    if (elementsDraft) {
      next.elements = elementsDraft
      dirty = true
    }
    if (noteDraft != null) {
      next.personalNote = previewNote
      if (previewInspiration) next.inspirationUploadId = previewInspiration
      extra = { jewelerNotes: previewJewelerNotes }
      dirty = true
    }
    if (!dirty) return true
    const updated = await persist(next, extra)
    if (!updated) return false
    setSizeDraft(null)
    setMetalDraft(null)
    setSettingDraft(null)
    setStonesDraft(null)
    setElementsDraft(null)
    setNoteDraft(null)
    setJewelerNotesDraft(null)
    setInspirationUploadDraft(null)
    return true
  }

  const closePanel = () => {
    if (tab === 'size') setSizeDraft(null)
    else if (tab === 'metal') setMetalDraft(null)
    else if (tab === 'setting') setSettingDraft(null)
    else if (tab === 'stone') setStonesDraft(null)
    else if (tab === 'elements') setElementsDraft(null)
    else if (tab === 'inspiration') {
      setNoteDraft(null)
      setJewelerNotesDraft(null)
      setInspirationUploadDraft(null)
    }
    setTab(null)
  }

  const selectTab = (id: StudioTabId) => {
    if (tab === id) {
      setTab(null)
      return
    }
    if (id === 'size' && sizeDraft == null) setSizeDraft(sizeFromParameters(parameters))
    if (id === 'metal' && metalDraft == null) setMetalDraft(metalFromParameters(parameters))
    if (id === 'setting' && settingDraft == null) {
      setSettingDraft(settingCodeFromParameters(parameters) ?? '')
    }
    if (id === 'stone' && stonesDraft == null) setStonesDraft(stonesFromParameters(parameters))
    if (id === 'elements' && elementsDraft == null) {
      setElementsDraft(elementsFromParameters(parameters))
    }
    if (id === 'inspiration' && noteDraft == null) {
      setNoteDraft(noteFromParameters(parameters))
      setJewelerNotesDraft(design?.jewelerNotes ?? '')
      setInspirationUploadDraft(inspirationUploadFromParameters(parameters) ?? '')
    }
    setTab(id)
  }

  const offerSizeLock = (updated: DesignDetail) => {
    if (itemType !== 'RING' || updated.lockedFields?.includes('size')) {
      closePanel()
      return
    }
    Alert.alert(t('studioLockTitle'), t('studioLockBody'), [
      { text: t('cancel'), style: 'cancel', onPress: closePanel },
      {
        text: t('studioLockConfirm'),
        onPress: () => {
          void (async () => {
            try {
              await lockDesign(updated.id, { fields: ['size'], confirm: true })
              await refresh()
            } catch (err) {
              Alert.alert(t('authErrorTitle'), parseApiError(err) || t('designSaveFailed'))
            } finally {
              closePanel()
            }
          })()
        },
      },
    ])
  }

  const onFinish = async () => {
    if (tab === 'size') {
      if (!sizeDraft) {
        closePanel()
        return
      }
      if (sizeLocked) {
        closePanel()
        return
      }
      const sizeError = sizeDraftError(sizeDraft)
      if (sizeError) {
        Alert.alert(t('authErrorTitle'), sizeError)
        return
      }
      const updated = await persist({ ...parameters, size: sizePayload(itemType, sizeDraft) })
      if (updated) offerSizeLock(updated)
      return
    }
    if (tab === 'metal' && metalDraft) {
      const updated = await persist({ ...parameters, metal: metalDraft })
      if (updated) closePanel()
      return
    }
    if (tab === 'setting' && settingDraft) {
      const updated = await persist({ ...parameters, setting: { settingCode: settingDraft } })
      if (updated) closePanel()
      return
    }
    if (tab === 'stone' && stonesDraft) {
      const updated = await persist({ ...parameters, stones: stonesDraft })
      if (updated) closePanel()
      return
    }
    if (tab === 'elements' && elementsDraft) {
      const updated = await persist({ ...parameters, elements: elementsDraft })
      if (updated) closePanel()
      return
    }
    if (tab === 'inspiration') {
      const next: Record<string, unknown> = {
        ...parameters,
        personalNote: previewNote,
      }
      if (previewInspiration) next.inspirationUploadId = previewInspiration
      const updated = await persist(next, { jewelerNotes: previewJewelerNotes })
      if (updated) closePanel()
      return
    }
    closePanel()
  }

  const onGenerateInspiration = async () => {
    if (!design) return
    const prompt = (previewNote.trim() || 'Sample jewelry inspiration').slice(0, 500)
    try {
      setBusy(true)
      const queued = await createInspiration({
        designId: design.id,
        prompt: prompt.length >= 3 ? prompt : 'Sample jewelry inspiration',
      })
      // Generation runs on the server in the background (up to ~90 s with the provider).
      const job = await waitForAiJob(queued.id)
      if (job.status === 'SUCCEEDED' && job.outputUploadId) {
        setAiModelLink(job.outputUrl ?? null)
        await persist({ ...parameters, aiOutputUploadId: job.outputUploadId })
        return
      }
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        Alert.alert(t('studioInspirationGenerate'), t('studioInspirationStillRunning'))
        return
      }
      Alert.alert(t('authErrorTitle'), job.errorMessage || t('studioInspirationGenerateFailed'))
    } catch (err) {
      if (apiErrorCode(err) === 'AI_JOB_IN_PROGRESS') {
        Alert.alert(t('studioInspirationGenerate'), t('studioInspirationStillRunning'))
        return
      }
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('studioInspirationGenerateFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onUploadInspiration = async () => {
    try {
      const file = await pickChatPhoto()
      if (!file) return
      setBusy(true)
      const upload = await uploadChatFile(file)
      setInspirationUploadDraft(upload.id)
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('designSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onUploadElement = async () => {
    if ((elementsDraft ?? []).length >= STUDIO_MAX_ELEMENTS) return
    try {
      const file = await pickChatPhoto()
      if (!file) return
      setBusy(true)
      const upload = await uploadChatFile(file)
      setElementsDraft((current) => {
        const list = current ?? []
        if (list.length >= STUDIO_MAX_ELEMENTS) return list
        return [
          ...list,
          { customUploadId: upload.id, placement: placementForIndex(list.length, -0.12) },
        ]
      })
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('designSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onHelp = () => {
    Alert.alert(t('studioHelpTitle'), t('studioHelpBody'))
  }

  const onContinue = async () => {
    if (!design) return
    if (!(await flushDrafts())) return
    navigation.reset({ index: 0, routes: [{ name: 'HomeMain' }] })
    tabNavigation?.navigate('MyDesigns', { screen: 'DesignDetails', params: { designId: design.id } })
  }

  const onTryOn = async () => {
    if (!design) return
    if (!(await flushDrafts())) return
    try {
      const file = await pickChatPhoto()
      if (!file) return
      setBusy(true)
      const upload = await uploadChatFile(file)
      const job = await createVisualizationJob({ designId: design.id, inputUploadId: upload.id })
      const output = mediaUrl(job.outputUrl)
      if (job.status === 'SUCCEEDED' && output) {
        setPreviewUri(output)
        return
      }
      Alert.alert(t('authErrorTitle'), t('studioTryOnFailed'))
    } catch (err) {
      if (isPaywallError(err)) {
        Alert.alert(t('authErrorTitle'), t('studioTryOnPaywall'), [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('studioPaywallCta'),
            onPress: () => tabNavigation?.navigate('Profile', { screen: 'Pricing' }),
          },
        ])
        return
      }
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('studioTryOnFailed'))
    } finally {
      setBusy(false)
    }
  }

  const runExport = async (exportFormat: RenderExportFormat) => {
    if (!design) return
    if (!(await flushDrafts())) return
    try {
      setBusy(true)
      const job = await createRenderJob({ designId: design.id, exportFormat })
      const uri = mediaUrl(job.outputUrl)
      if (job.status !== 'SUCCEEDED' || !uri) {
        Alert.alert(t('authErrorTitle'), job.errorMessage || t('studioExportFailed'))
        return
      }
      if (exportFormat === 'PNG_HD') {
        setPreviewUri(uri)
        return
      }
      try {
        await Linking.openURL(uri)
      } catch {
        Alert.alert(t('studioExportReady'), uri)
      }
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('studioExportFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onExport = () => {
    Alert.alert(t('studioExportTitle'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('studioExportStl'), onPress: () => void runExport('STL') },
      { text: t('studioExportPng'), onPress: () => void runExport('PNG_HD') },
    ])
  }

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <HomeHeader backdropColor="#F6F2FF" onBack={() => navigation.goBack()} />

      {error && !design ? (
        <View style={styles.errorWrap}>
          <ErrorState
            title={t('commonLoadingErrorTitle')}
            message={t('commonLoadingErrorMessage')}
            retryLabel={t('commonRetry')}
            onRetry={retry}
          />
        </View>
      ) : (
        <>
          <View style={styles.stage}>
            <View style={styles.viewerSlot}>
            <StudioViewer
              itemType={itemType}
              metalHex={metalHexFromCode(previewMetal.metalCode)}
              metalCode={previewMetal.metalCode}
              purityCode={previewMetal.purityCode}
              settingCode={previewSetting}
              scale={scaleFromSize(previewSize)}
              tube={tubeFromBandWidthMm(previewSize.bandWidthMm)}
              markers={markers}
              modelUri={aiModelUri}
            />
            {!tab ? (
              <Pressable
                onPress={onHelp}
                style={styles.helpBtn}
                accessibilityRole="button"
                accessibilityLabel={t('studioHelpA11y')}
              >
                <Text style={styles.helpMark}>?</Text>
              </Pressable>
            ) : null}
            </View>
          {tab ? (
            <View style={[styles.panel, tab === 'size' ? styles.panelCompact : null]} pointerEvents="auto">
              {tab !== 'size' && tab !== 'metal' ? (
                <Text style={styles.panelTitle}>{t(TAB_TITLE[tab])}</Text>
              ) : null}
              <ScrollView
                style={tab === 'size' ? undefined : styles.panelBody}
                contentContainerStyle={styles.panelBodyContent}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={tab !== 'size'}
              >
              {tab === 'size' && sizeDraft ? (
                <StudioSizePanel
                  itemType={itemType}
                  charts={chartsQuery.data ?? []}
                  value={sizeDraft}
                  locked={sizeLocked}
                  onChange={setSizeDraft}
                  onMeasureGuide={() =>
                    navigation.navigate('MeasurementGuide', { category: jewelryCategory(design?.itemType?.code) })
                  }
                />
              ) : null}
              {tab === 'metal' && metalDraft ? (
                <StudioMetalPanel
                  metals={metals}
                  value={metalDraft}
                  onChange={setMetalDraft}
                />
              ) : null}
              {tab === 'setting' && settingDraft != null ? (
                <StudioSettingPanel
                  settings={settingsQuery.data ?? []}
                  selectedCode={previewSetting}
                  itemTypeCode={itemType}
                  onSelect={setSettingDraft}
                />
              ) : null}
              {tab === 'stone' && stonesDraft ? (
                <StudioCatalogList
                  catalog={stoneCatalog}
                  max={STUDIO_MAX_STONES}
                  selected={stonesDraft.map((stone) => ({
                    code: stone.stoneCode,
                    label: stoneCatalog.find((item) => item.code === stone.stoneCode)?.label ?? stone.stoneCode,
                  }))}
                  onAdd={(code) =>
                    setStonesDraft((current) => {
                      const list = current ?? []
                      if (list.length >= STUDIO_MAX_STONES) return list
                      return [
                        ...list,
                        { stoneCode: code, placement: placementForIndex(list.length, 0.28) },
                      ]
                    })
                  }
                  onRemove={(index) =>
                    setStonesDraft((current) => (current ?? []).filter((_, i) => i !== index))
                  }
                />
              ) : null}
              {tab === 'elements' && elementsDraft ? (
                <StudioCatalogList
                  catalog={elementCatalog}
                  max={STUDIO_MAX_ELEMENTS}
                  selected={elementsDraft.map((element, index) => ({
                    code: element.elementCode ?? element.customUploadId ?? `el-${index}`,
                    label: element.customUploadId
                      ? t('studioCustomElement')
                      : elementCatalog.find((item) => item.code === element.elementCode)?.label ??
                        element.elementCode ??
                        t('studioCustomElement'),
                  }))}
                  extraActionLabel={t('studioUploadElement')}
                  onExtraAction={() => void onUploadElement()}
                  onAdd={(code) =>
                    setElementsDraft((current) => {
                      const list = current ?? []
                      if (list.length >= STUDIO_MAX_ELEMENTS) return list
                      return [
                        ...list,
                        { elementCode: code, placement: placementForIndex(list.length, -0.12) },
                      ]
                    })
                  }
                  onRemove={(index) =>
                    setElementsDraft((current) => (current ?? []).filter((_, i) => i !== index))
                  }
                />
              ) : null}
              {tab === 'inspiration' && noteDraft != null && jewelerNotesDraft != null ? (
                <StudioInspirationPanel
                  note={previewNote}
                  jewelerNotes={previewJewelerNotes}
                  hasImage={Boolean(previewInspiration)}
                  generating={busy}
                  onChangeNote={setNoteDraft}
                  onChangeJewelerNotes={setJewelerNotesDraft}
                  onUpload={() => void onUploadInspiration()}
                  onGenerate={() => void onGenerateInspiration()}
                />
              ) : null}
              </ScrollView>
              <View style={styles.panelActions}>
                <BrandButton
                  label={t('studioFinishCta')}
                  hug
                  flex={false}
                  disabled={busy}
                  onPress={() => void onFinish()}
                />
                <BrandButton
                  label={t('cancel')}
                  variant="outline"
                  hug
                  flex={false}
                  onPress={closePanel}
                  disabled={busy}
                />
              </View>
            </View>
          ) : null}
          </View>

          {!tab && design ? (
            <View style={styles.exitBar}>
              <View style={styles.exitRow}>
                <BrandButton
                  label={t('studioTryOnCta')}
                  variant="outline"
                  disabled={busy}
                  onPress={() => void onTryOn()}
                />
                <BrandButton
                  label={t('studioExportCta')}
                  variant="outline"
                  disabled={busy}
                  onPress={onExport}
                />
              </View>
              <BrandButton
                label={t('studioDoneCta')}
                flex={false}
                disabled={busy}
                onPress={() => void onContinue()}
              />
            </View>
          ) : null}

          <StudioTabBar active={tab} onSelect={selectTab} />
        </>
      )}
      <ChatImageViewer imageUri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  errorWrap: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    minHeight: 280,
    overflow: 'hidden',
    backgroundColor: '#F6F2FF',
  },
  viewerSlot: {
    flex: 1,
    minHeight: 160,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F6F2FF',
  },
  helpBtn: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    zIndex: 3,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpMark: {
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    color: colors.textInverse,
    marginTop: -1,
  },
  panel: {
    width: '100%',
    flexShrink: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 16,
    maxHeight: '42%',
  },
  panelCompact: {
    height: 188,
    maxHeight: 188,
  },
  panelBody: {
    flexGrow: 0,
    maxHeight: 280,
  },
  panelBodyContent: {
    gap: 12,
    paddingBottom: 4,
  },
  panelTitle: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  panelActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    direction: 'ltr',
  },
  exitBar: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
    backgroundColor: colors.surface,
  },
  exitRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
})
