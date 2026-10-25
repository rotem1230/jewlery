import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { StudioViewer, type StudioPlacementEvent } from '@/src/components/studio/StudioViewer'
import { StudioTabBar, type StudioTabId } from '@/src/components/studio/StudioTabBar'
import { StudioSizePanel } from '@/src/components/studio/StudioSizePanel'
import { StudioMetalPanel } from '@/src/components/studio/StudioMetalPanel'
import { StudioSettingPanel } from '@/src/components/studio/StudioSettingPanel'
import { StudioStonePanel } from '@/src/components/studio/StudioStonePanel'
import { StudioElementPanel } from '@/src/components/studio/StudioElementPanel'
import { StudioInspirationPanel } from '@/src/components/studio/StudioInspirationPanel'
import { TryOnPlacement } from '@/src/components/studio/TryOnPlacement'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { ChatImageViewer } from '@/src/components/chats/ChatImageViewer'
import { getDesign, lockDesign, updateDesign } from '@/src/api/designs'
import { createInspiration, waitForAiJob } from '@/src/api/ai'
import { createRenderJob, waitForRenderJob, type RenderExportFormat } from '@/src/api/renderJobs'
import { createVisualizationJob, getFeatureFlags, getTryOnOverlay } from '@/src/api/visualization'
import { getMyEntitlements } from '@/src/api/subscriptions'
import {
  CATEGORY_CODE,
  listElements,
  listMetals,
  listSettings,
  listStones,
  listWizardSizeCharts,
} from '@/src/api/masterData'
import { deleteUpload, uploadChatFile } from '@/src/api/uploads'
import { linkForUpload, mediaUrl } from '@/src/lib/media'
import { attachedAiJob, rememberPendingAiJob, takeFinishedAiJob } from '@/src/lib/pendingAiJobs'
import { pickChatPhoto, pickTryOnPhoto } from '@/src/lib/chatAttachments'
import { apiErrorCode, parseApiError } from '@/src/lib/api'
import { aiQuotaMessage } from '@/src/lib/plans'
import { isDesignReadOnly } from '@/src/lib/designActions'
import { jobRefusal, tryOnGate, withPhotoRemovedOnRefusal } from '@/src/lib/tryOn'
import type { TryOnPlacementValue } from '@/src/lib/tryOnPlacement'
import {
  FALLBACK_METALS,
  STUDIO_MAX_ELEMENTS,
  WRIST_MAX_CM,
  WRIST_MIN_CM,
  addElement,
  bandWidthConflict,
  elementPayload,
  elementsFromParameters,
  inspirationUploadFromParameters,
  isNecklaceLength,
  metalFromParameters,
  noteFromParameters,
  ringChartDiameterMm,
  settingFromParameters,
  settingPayload,
  sizeFromParameters,
  sizePayload,
  stonePayload,
  stonesFromParameters,
  viewerParameters,
  withDraggedPlacement,
  withGeneratedInspiration,
  type StudioElement,
  type StudioMetal,
  type StudioSetting,
  type StudioSize,
  type StudioStone,
} from '@/src/lib/studioParams'
import { elementDef } from '@/src/lib/jewelryCatalog.generated'
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
 * Figma 3D wizard: the piece built from its parameters + six live tabs. PATCH parameters on סיימתי.
 * Inspiration generate is the only path that creates an AI job (an inspiration picture).
 * A completed design (accepted quote) opens in view mode: no edit tabs, nothing is saved.
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
  const [settingDraft, setSettingDraft] = useState<StudioSetting | null>(null)
  const [stonesDraft, setStonesDraft] = useState<StudioStone[] | null>(null)
  const [elementsDraft, setElementsDraft] = useState<StudioElement[] | null>(null)
  /** The stone / element open in its tab, and whether a drag on the model moves it. */
  const [stoneIndex, setStoneIndex] = useState(0)
  const [elementIndex, setElementIndex] = useState(0)
  const [moving, setMoving] = useState(false)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [jewelerNotesDraft, setJewelerNotesDraft] = useState<string | null>(null)
  const [inspirationUploadDraft, setInspirationUploadDraft] = useState<string | null>(null)
  /** Signed link of the picture just uploaded or generated (the saved design carries inspirationUrl). */
  const [inspirationLink, setInspirationLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  /** The photo being placed for a try-on (uploaded; removed again if the designer cancels). */
  const [tryOnPhoto, setTryOnPhoto] = useState<{ uri: string; uploadId: string } | null>(null)

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
  const readOnly = design ? isDesignReadOnly(design) : false
  const sizeLocked = Boolean(design?.lockedFields?.includes('size'))
  const savedSize = sizeFromParameters(parameters)
  const previewSize = sizeDraft ?? savedSize
  const previewSetting = settingDraft ?? settingFromParameters(itemType, parameters)
  const previewNote = noteDraft ?? noteFromParameters(parameters)
  const previewJewelerNotes = jewelerNotesDraft ?? design?.jewelerNotes ?? ''
  const previewInspiration = inspirationUploadDraft ?? inspirationUploadFromParameters(parameters)
  // The link that serves the picture in use: the design's own (signed again at each load) once it is
  // saved, else the one kept from the upload / generation.
  const inspirationUri = mediaUrl(linkForUpload(previewInspiration, design?.inspirationUrl, inspirationLink))
  // Live check of the server rule: a ring band no narrower than the chosen setting's minimum.
  const bandConflict = bandWidthConflict(
    itemType,
    previewSize.bandWidthMm,
    previewSetting,
    settingsQuery.data ?? [],
    locale === 'en' ? 'en' : 'he',
  )
  const panelConflict = tab === 'size' || tab === 'setting' ? bandConflict : null
  // What the 3D viewer builds: the saved design with the open tab's choices applied.
  const previewParameters = useMemo(
    () =>
      viewerParameters(itemType, design?.parameters, {
        size: sizeDraft,
        metal: metalDraft,
        setting: settingDraft,
        stones: stonesDraft,
        elements: elementsDraft,
      }),
    [itemType, design?.parameters, sizeDraft, metalDraft, settingDraft, stonesDraft, elementsDraft],
  )
  const chartDiameter = ringChartDiameterMm(chartsQuery.data ?? [], previewSize)
  const stonesCount = Array.isArray(previewParameters.stones) ? previewParameters.stones.length : 0

  const metals =
    (metalsQuery.data ?? []).length > 0 ? (metalsQuery.data ?? []) : FALLBACK_METALS
  // What the server offers (an admin can turn items off); empty while loading = the whole catalogue.
  const offeredStones = (stonesQuery.data ?? []).map((stone) => stone.code)
  const offeredElements = (elementsQuery.data ?? []).map((element) => element.code)

  /** A text element (a name, a date) needs its text before it can be saved. */
  const missingText = (list: StudioElement[] | null): string | null => {
    const empty = (list ?? []).find((element) => elementDef(element.elementCode)?.text && !element.text)
    if (!empty) return null
    const def = elementDef(empty.elementCode)
    const name = def ? (locale === 'en' ? def.labelEn : def.labelHe) : ''
    return t('studioElementTextNeeded').replace('{{name}}', name)
  }

  const onPlacement = (event: StudioPlacementEvent) => {
    if (event.kind === 'stone') setStonesDraft((current) => (current ? withDraggedPlacement(current, event.index, event) : current))
    else setElementsDraft((current) => (current ? withDraggedPlacement(current, event.index, event) : current))
  }
  const editTarget =
    moving && tab === 'stone' && stonesDraft?.[stoneIndex]
      ? { kind: 'stone' as const, index: stoneIndex }
      : moving && tab === 'elements' && elementsDraft?.[elementIndex]
        ? { kind: 'element' as const, index: elementIndex }
        : null

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

  // A generation the studio stopped waiting for on an earlier visit is attached once it is done
  // (only while the design can still be edited). The latest values are read through a ref so the
  // check runs once per design, not on every render.
  const latestForAi = useRef({ persist, parameters, editable: Boolean(design) && !readOnly })
  latestForAi.current = { persist, parameters, editable: Boolean(design) && !readOnly }
  const loadedDesignId = design?.id
  useEffect(() => {
    if (!loadedDesignId) return
    let cancelled = false
    const attachFinished = async () => {
      const job = await takeFinishedAiJob(loadedDesignId)
      if (cancelled || !job?.outputUploadId) return
      const { persist: save, parameters: current, editable } = latestForAi.current
      // The finished picture becomes the inspiration picture (nothing to do when it already is).
      const next = editable ? withGeneratedInspiration(current, job.outputUploadId) : null
      if (!next) {
        await attachedAiJob(loadedDesignId, job.id)
        return
      }
      if (await save(next)) {
        await attachedAiJob(loadedDesignId, job.id)
      }
    }
    attachFinished().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [loadedDesignId])

  const sizeDraftError = (draft: StudioSize): string | null => {
    if (itemType === 'RING' && !draft.sizeCode) return t('sizeNeedRingSize')
    if (itemType === 'NECKLACE' && !isNecklaceLength(draft.necklaceLengthCm)) return t('dzNeedNecklaceLength')
    if (itemType === 'BRACELET') {
      const wrist = draft.wristCircumferenceCm
      if (wrist == null || wrist < WRIST_MIN_CM || wrist > WRIST_MAX_CM) return t('sizeNeedWrist')
    }
    return null
  }

  const flushDrafts = async (): Promise<boolean> => {
    if (!design) return false
    if (readOnly) return true
    if (bandConflict && (sizeDraft || settingDraft)) {
      Alert.alert(t('authErrorTitle'), bandConflict.message)
      return false
    }
    const textError = missingText(elementsDraft)
    if (textError) {
      Alert.alert(t('authErrorTitle'), textError)
      return false
    }
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
      next.setting = settingPayload(settingDraft, parameters, itemType)
      dirty = true
    }
    if (stonesDraft) {
      next.stones = stonesDraft.map(stonePayload)
      dirty = true
    }
    if (elementsDraft) {
      next.elements = elementsDraft.map(elementPayload)
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
    setMoving(false)
    return true
  }

  const closePanel = () => {
    setMoving(false)
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
    setMoving(false)
    if (id === 'setting' && settingDraft == null) setSettingDraft(settingFromParameters(itemType, parameters))
    if (id === 'stone' && stonesDraft == null) {
      setStonesDraft(stonesFromParameters(parameters))
      setStoneIndex(0)
    }
    if (id === 'elements' && elementsDraft == null) {
      setElementsDraft(elementsFromParameters(parameters))
      setElementIndex(0)
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
    if (panelConflict) {
      Alert.alert(t('authErrorTitle'), panelConflict.message)
      return
    }
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
      const updated = await persist({ ...parameters, setting: settingPayload(settingDraft, parameters, itemType) })
      if (updated) closePanel()
      return
    }
    if (tab === 'stone' && stonesDraft) {
      const updated = await persist({ ...parameters, stones: stonesDraft.map(stonePayload) })
      if (updated) closePanel()
      return
    }
    if (tab === 'elements' && elementsDraft) {
      const textError = missingText(elementsDraft)
      if (textError) {
        Alert.alert(t('authErrorTitle'), textError)
        return
      }
      const updated = await persist({ ...parameters, elements: elementsDraft.map(elementPayload) })
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
    const note = previewNote.trim()
    // The AI works from the note, and from the inspiration picture when there is one: one of them
    // is needed.
    if (!previewInspiration && note.length < 3) {
      Alert.alert(t('studioInspirationGenerate'), t('studioInspirationNeedInput'))
      return
    }
    // The server reads the picture from the saved design. Saving closes the panel's drafts; they
    // are opened again with what was saved, so the panel stays while the picture is made.
    const panel = {
      note: previewNote,
      jewelerNotes: previewJewelerNotes,
      picture: previewInspiration ?? '',
      link: inspirationLink,
    }
    if (!(await flushDrafts())) return
    setNoteDraft(panel.note)
    setJewelerNotesDraft(panel.jewelerNotes)
    setInspirationUploadDraft(panel.picture)
    setInspirationLink(panel.link)
    const prompt = (note.length >= 3 ? note : t('studioInspirationPhotoPrompt')).slice(0, 500)
    try {
      setBusy(true)
      const queued = await createInspiration({ designId: design.id, prompt })
      // Remembered until attached: if the wait below ends first (or fails), the next visit
      // attaches the result.
      await rememberPendingAiJob(design.id, queued.id)
      const job = await waitForAiJob(queued.id)
      if (job.status === 'SUCCEEDED' && job.outputUploadId) {
        // Saved on the design as it is now: the notes saved above made a newer version than the
        // one this function started with.
        const { persist: save, parameters: current } = latestForAi.current
        const next = withGeneratedInspiration(current, job.outputUploadId)
        if (!next || (await save(next))) {
          await attachedAiJob(design.id, queued.id)
          setInspirationUploadDraft(job.outputUploadId)
          setInspirationLink(job.outputUrl ?? null)
        }
        return
      }
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        Alert.alert(t('studioInspirationGenerate'), t('studioInspirationStillRunning'))
        return
      }
      await attachedAiJob(design.id, queued.id)
      Alert.alert(t('authErrorTitle'), job.errorMessage || t('studioInspirationGenerateFailed'))
    } catch (err) {
      if (apiErrorCode(err) === 'AI_JOB_IN_PROGRESS') {
        Alert.alert(t('studioInspirationGenerate'), t('studioInspirationStillRunning'))
        return
      }
      if (apiErrorCode(err) === 'AI_NOT_CONFIGURED') {
        Alert.alert(t('studioInspirationGenerate'), t('studioInspirationUnavailable'))
        return
      }
      const quota = aiQuotaMessage(err, locale)
      if (quota) {
        if (quota.upgrade) showPaywall(quota.message)
        else Alert.alert(t('studioInspirationGenerate'), quota.message)
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
      setInspirationLink(upload.contentUrl ?? null)
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
        const next = addElement(itemType, list, { customUploadId: upload.id }, previewSize.bandWidthMm, stonesCount)
        if (next !== list) setElementIndex(next.length - 1)
        return next
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
    tabNavigation?.navigate('MyDesigns', { screen: 'DesignDetails', params: { designId: design.id }, initial: false })
  }

  const showPaywall = (message: string) => {
    Alert.alert(t('authErrorTitle'), message, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('studioPaywallCta'),
        onPress: () => tabNavigation?.navigate('Profile', { screen: 'Pricing', initial: false }),
      },
    ])
  }

  /**
   * Try-on (PRD 5.10). The personal photo is picked and uploaded only once the feature is on and
   * the plan includes it, so a refused try-on never sends the photo. A refusal after the upload
   * (e.g. the daily limit) deletes the photo again (`withPhotoRemovedOnRefusal`).
   */
  const onTryOn = async () => {
    if (!design) return
    if (!(await flushDrafts())) return
    setBusy(true)
    let gate: ReturnType<typeof tryOnGate>
    try {
      const [flags, entitlements] = await Promise.all([
        getFeatureFlags().catch(() => null),
        getMyEntitlements(),
      ])
      gate = tryOnGate(flags, entitlements)
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('studioTryOnFailed'))
      return
    } finally {
      setBusy(false)
    }
    if (gate === 'coming_soon') {
      Alert.alert(t('dzTryOnComingSoonTitle'), t('dzTryOnComingSoon'))
      return
    }
    if (gate === 'paywall') {
      showPaywall(t('studioTryOnPaywall'))
      return
    }
    try {
      const file = await pickTryOnPhoto()
      if (!file) return
      setBusy(true)
      const upload = await uploadChatFile(file)
      // Next the designer places the piece on the photo (TryOnPlacement), then confirms.
      setTryOnPhoto({ uri: file.uri, uploadId: upload.id })
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('studioTryOnFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onConfirmTryOn = async (placement: TryOnPlacementValue) => {
    if (!design || !tryOnPhoto) return
    const photo = tryOnPhoto
    try {
      setBusy(true)
      const job = await withPhotoRemovedOnRefusal(
        photo.uploadId,
        () => createVisualizationJob({ designId: design.id, inputUploadId: photo.uploadId, placement }),
        deleteUpload,
      )
      setTryOnPhoto(null)
      const output = mediaUrl(job.outputUrl)
      if (job.status === 'SUCCEEDED' && output) {
        setPreviewUri(output)
        return
      }
      Alert.alert(t('authErrorTitle'), t('studioTryOnFailed'))
    } catch (err) {
      setTryOnPhoto(null)
      const refusal = jobRefusal(err)
      if (refusal === 'coming_soon') Alert.alert(t('dzTryOnComingSoonTitle'), t('dzTryOnComingSoon'))
      else if (refusal === 'paywall') showPaywall(t('studioTryOnPaywall'))
      else if (refusal === 'quota') Alert.alert(t('authErrorTitle'), t('dzTryOnQuota'))
      else Alert.alert(t('authErrorTitle'), parseApiError(err) || t('studioTryOnFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onCancelTryOn = () => {
    const photo = tryOnPhoto
    setTryOnPhoto(null)
    // The photo was only for this try-on: it does not stay on the server.
    if (photo) void deleteUpload(photo.uploadId).catch(() => undefined)
  }

  const runExport = async (exportFormat: RenderExportFormat) => {
    if (!design) return
    if (!(await flushDrafts())) return
    try {
      setBusy(true)
      const job = await waitForRenderJob(await createRenderJob({ designId: design.id, exportFormat }))
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
      // HD needs the hd_export entitlement (PRD 5.8); STL is free.
      const refusal = jobRefusal(err)
      if (refusal === 'paywall') showPaywall(t('dzExportPaywall'))
      else if (refusal === 'quota') Alert.alert(t('authErrorTitle'), t('dzExportQuota'))
      else Alert.alert(t('authErrorTitle'), parseApiError(err) || t('studioExportFailed'))
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
      {design && tryOnPhoto ? (
        <TryOnPlacement
          visible
          photoUri={tryOnPhoto.uri}
          loadOverlay={(signal) => getTryOnOverlay(design.id, design.version, signal)}
          busy={busy}
          onConfirm={(placement) => void onConfirmTryOn(placement)}
          onCancel={onCancelTryOn}
        />
      ) : null}

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
              parameters={previewParameters}
              ringChartDiameterMm={chartDiameter}
              editTarget={editTarget}
              onPlacement={onPlacement}
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
              {tab === 'setting' && settingDraft ? (
                <StudioSettingPanel
                  settings={settingsQuery.data ?? []}
                  itemTypeCode={itemType}
                  value={settingDraft}
                  onChange={setSettingDraft}
                  offeredStones={offeredStones}
                />
              ) : null}
              {tab === 'stone' && stonesDraft ? (
                <StudioStonePanel
                  itemType={itemType}
                  stones={stonesDraft}
                  onChange={setStonesDraft}
                  offered={offeredStones}
                  parameters={previewParameters}
                  bandWidthMm={previewSize.bandWidthMm}
                  selected={stoneIndex}
                  onSelect={(index) => {
                    setStoneIndex(index)
                    setMoving(false)
                  }}
                  moving={moving}
                  onToggleMove={() => setMoving((on) => !on)}
                />
              ) : null}
              {tab === 'elements' && elementsDraft ? (
                <StudioElementPanel
                  itemType={itemType}
                  elements={elementsDraft}
                  onChange={setElementsDraft}
                  onAdd={(elementCode) =>
                    setElementsDraft((current) =>
                      addElement(itemType, current ?? [], { elementCode }, previewSize.bandWidthMm, stonesCount),
                    )
                  }
                  onUpload={() => void onUploadElement()}
                  offered={offeredElements}
                  parameters={previewParameters}
                  bandWidthMm={previewSize.bandWidthMm}
                  selected={elementIndex}
                  onSelect={(index) => {
                    setElementIndex(index)
                    setMoving(false)
                  }}
                  moving={moving}
                  onToggleMove={() => setMoving((on) => !on)}
                />
              ) : null}
              {tab === 'inspiration' && noteDraft != null && jewelerNotesDraft != null ? (
                <StudioInspirationPanel
                  note={previewNote}
                  jewelerNotes={previewJewelerNotes}
                  hasImage={Boolean(previewInspiration)}
                  imageUri={inspirationUri}
                  generating={busy}
                  onChangeNote={setNoteDraft}
                  onChangeJewelerNotes={setJewelerNotesDraft}
                  onUpload={() => void onUploadInspiration()}
                  onGenerate={() => void onGenerateInspiration()}
                />
              ) : null}
              </ScrollView>
              {panelConflict ? <Text style={styles.warning}>{panelConflict.message}</Text> : null}
              <View style={styles.panelActions}>
                <BrandButton
                  label={t('studioFinishCta')}
                  hug
                  flex={false}
                  disabled={busy || Boolean(panelConflict)}
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
              {readOnly ? <Text style={styles.readOnly}>{t('dzStudioReadOnly')}</Text> : null}
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

          {readOnly ? null : <StudioTabBar active={tab} onSelect={selectTab} />}
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
  warning: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '500',
    color: '#B42318',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  readOnly: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
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
