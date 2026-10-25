import { useEffect, useMemo, useRef, type ComponentType, type Ref } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import WebView from 'react-native-webview'
import type { WebView as WebViewRef, WebViewMessageEvent } from 'react-native-webview'
import { studioViewerHtml } from '@/src/lib/studioViewerHtml'
import { API_BASE_URL } from '@/src/lib/api'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioItemType = 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS'

/** The item a drag on the model places. */
export type StudioEditTarget = { kind: 'stone' | 'element'; index: number }

/** Where the user let go of an item on the model. */
export type StudioPlacementEvent = StudioEditTarget & { angleDeg: number; offsetMm: number }

/** A placement posted by the viewer page, or null for any other message. */
export function placementFromMessage(data: string): StudioPlacementEvent | null {
  if (!data.startsWith('placement:')) return null
  try {
    const value = JSON.parse(data.slice('placement:'.length)) as Record<string, unknown>
    const { kind, index, angleDeg, offsetMm } = value
    if ((kind !== 'stone' && kind !== 'element') || !Number.isInteger(index)) return null
    if (typeof angleDeg !== 'number' || !Number.isFinite(angleDeg) || typeof offsetMm !== 'number' || !Number.isFinite(offsetMm)) {
      return null
    }
    return { kind, index: index as number, angleDeg, offsetMm }
  } catch {
    return null
  }
}

type StudioViewerProps = {
  itemType?: StudioItemType
  /** The design's parameters with the open tab's draft applied: what the piece looks like now. */
  parameters: Record<string, unknown>
  /** Inner diameter of the chosen ring size from the size chart (mm), when known. */
  ringChartDiameterMm?: number | null
  interactive?: boolean
  /** While set, a one-finger drag on the model moves this item (the view no longer turns). */
  editTarget?: StudioEditTarget | null
  onPlacement?: (event: StudioPlacementEvent) => void
}

type StudioWebViewProps = {
  ref?: Ref<WebViewRef | null>
  originWhitelist?: string[]
  source: { html: string; baseUrl?: string }
  style?: object
  scrollEnabled?: boolean
  bounces?: boolean
  overScrollMode?: 'never' | 'always' | 'content'
  javaScriptEnabled?: boolean
  allowsInlineMediaPlayback?: boolean
  automaticallyAdjustContentInsets?: boolean
  contentInsetAdjustmentBehavior?: 'never' | 'automatic' | 'scrollableAxes' | 'always'
  allowFileAccess?: boolean
  allowFileAccessFromFileURLs?: boolean
  allowUniversalAccessFromFileURLs?: boolean
  mixedContentMode?: 'never' | 'always' | 'compatibility'
  nestedScrollEnabled?: boolean
  directionalLockEnabled?: boolean
  onMessage?: (event: WebViewMessageEvent) => void
}

const StudioWebView = WebView as unknown as ComponentType<StudioWebViewProps>

function send(view: WebViewRef | null, payload: Record<string, unknown>) {
  view?.injectJavaScript(`window.__studioSet && window.__studioSet(${JSON.stringify(payload)}); true;`)
}

/**
 * The 3D studio: builds the piece from its parameters with the same geometry the server exports
 * (STL, HD pictures), so edits show exactly what will be made. Tabs only PATCH parameters.
 */
export function StudioViewer({
  itemType = 'RING',
  parameters,
  ringChartDiameterMm,
  interactive = true,
  editTarget = null,
  onPlacement,
}: StudioViewerProps) {
  const { t } = useTranslation()
  const ref = useRef<WebViewRef>(null)
  const ready = useRef(false)
  const design = useMemo(
    () => ({ type: 'setDesign', itemType, parameters, ringChartDiameterMm: ringChartDiameterMm ?? null }),
    [itemType, parameters, ringChartDiameterMm],
  )
  const designJson = JSON.stringify(design)
  const designRef = useRef(design)
  designRef.current = design

  const edit = useMemo(() => ({ type: 'edit', target: editTarget }), [editTarget])
  const editRef = useRef(edit)
  editRef.current = edit
  const editJson = JSON.stringify(edit)
  const onPlacementRef = useRef(onPlacement)
  onPlacementRef.current = onPlacement

  const html = useMemo(() => studioViewerHtml({ itemType }), [itemType])
  const htmlRev = `studio-${itemType}-parametric-v23`
  const baseUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, '')
  const layout = useRef({ width: 0, height: 0 })

  useEffect(() => {
    ready.current = false
  }, [htmlRev])

  useEffect(() => {
    if (!ready.current) return
    send(ref.current, designRef.current)
  }, [designJson])

  useEffect(() => {
    if (!ready.current) return
    send(ref.current, editRef.current)
  }, [editJson])

  return (
    <View
      style={styles.wrap}
      pointerEvents={interactive ? 'auto' : 'none'}
      collapsable={false}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        layout.current = { width, height }
        send(ref.current, { type: 'resize', width, height })
      }}
    >
      <StudioWebView
        key={htmlRev}
        ref={ref}
        originWhitelist={['*']}
        source={{ html, baseUrl }}
        style={styles.web}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        allowsInlineMediaPlayback
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        nestedScrollEnabled
        directionalLockEnabled={false}
        onMessage={(event: WebViewMessageEvent) => {
          const data = event.nativeEvent.data
          if (typeof data === 'string' && data.startsWith('error:')) {
            console.warn('[studio-viewer]', data)
            return
          }
          if (typeof data === 'string' && data.startsWith('placement:')) {
            const placement = placementFromMessage(data)
            if (placement) onPlacementRef.current?.(placement)
            return
          }
          if (data !== 'ready') return
          ready.current = true
          if (layout.current.width > 0) {
            send(ref.current, { type: 'resize', width: layout.current.width, height: layout.current.height })
          }
          send(ref.current, designRef.current)
          send(ref.current, editRef.current)
        }}
      />
      <View style={styles.zoomStack} pointerEvents="box-none">
        <Pressable
          onPress={() => send(ref.current, { type: 'zoom', factor: 0.82 })}
          style={styles.zoomBtn}
          accessibilityRole="button"
          accessibilityLabel={t('studioZoomInA11y')}
        >
          <Text style={styles.zoomMark}>+</Text>
        </Pressable>
        <Pressable
          onPress={() => send(ref.current, { type: 'zoom', factor: 1.22 })}
          style={styles.zoomBtn}
          accessibilityRole="button"
          accessibilityLabel={t('studioZoomOutA11y')}
        >
          <Text style={styles.zoomMark}>−</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F6F2FF',
    overflow: 'hidden',
  },
  web: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  zoomStack: {
    position: 'absolute',
    left: 18,
    top: 12,
    zIndex: 4,
    gap: 8,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomMark: {
    fontFamily: 'Heebo',
    fontSize: 22,
    fontWeight: '600',
    color: colors.brand,
    marginTop: -1,
  },
})
