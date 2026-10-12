import { useEffect, useMemo, useRef, type ComponentType, type Ref } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import WebView from 'react-native-webview'
import type { WebView as WebViewRef, WebViewMessageEvent } from 'react-native-webview'
import ringGlb from '../../../assets/models/studio/ring.glb'
import necklaceGlb from '../../../assets/models/studio/necklace.glb'
import braceletGlb from '../../../assets/models/studio/bracelet.glb'
import earringsGlb from '../../../assets/models/studio/earrings.glb'
import { studioViewerHtml } from '@/src/lib/studioViewerHtml'
import { API_BASE_URL } from '@/src/lib/api'
import type { StudioMarker } from '@/src/lib/studioParams'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioItemType = 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS'

const CATALOG = {
  RING: ringGlb,
  NECKLACE: necklaceGlb,
  BRACELET: braceletGlb,
  EARRINGS: earringsGlb,
}

type StudioViewerProps = {
  itemType?: StudioItemType
  metalHex: string
  metalCode?: string
  purityCode?: string
  settingCode?: string
  scale: number
  tube: number
  markers: StudioMarker[]
  interactive?: boolean
  /** Hosted GLB from our uploads (AI sample). Catalog dummy if omitted. Never a Tripo URL. */
  modelUri?: string
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

function send(
  view: WebViewRef | null,
  payload: {
    type: string
    hex?: string
    code?: string
    purity?: string
    scale?: number
    tube?: number
    factor?: number
    width?: number
    height?: number
    markers?: StudioMarker[]
  },
) {
  view?.injectJavaScript(`window.__studioSet && window.__studioSet(${JSON.stringify(payload)}); true;`)
}

/** Local preview: catalog dummy GLB, or an upload we host after Inspiration AI. Tabs only PATCH parameters. */
export function StudioViewer({
  itemType = 'RING',
  metalHex,
  metalCode,
  purityCode,
  settingCode,
  scale,
  tube,
  markers,
  interactive = true,
  modelUri,
}: StudioViewerProps) {
  const { t } = useTranslation()
  const ref = useRef<WebViewRef>(null)
  const ready = useRef(false)
  const metalRef = useRef({ hex: metalHex, code: metalCode, purity: purityCode })
  const scaleRef = useRef(scale)
  const tubeRef = useRef(tube)
  const settingRef = useRef(settingCode)
  const markersRef = useRef(markers)
  metalRef.current = { hex: metalHex, code: metalCode, purity: purityCode }
  scaleRef.current = scale
  tubeRef.current = tube
  settingRef.current = settingCode
  markersRef.current = markers

  const catalogUri = Image.resolveAssetSource(CATALOG[itemType] ?? ringGlb)?.uri ?? ''
  const glbUri = modelUri || catalogUri
  const html = useMemo(() => studioViewerHtml(glbUri, itemType), [glbUri, itemType])
  const htmlRev = `glb-${itemType}-${modelUri ?? 'catalog'}-v20`
  const baseUrl = modelUri ? API_BASE_URL.replace(/\/api\/v1\/?$/, '') : 'http://localhost:8081'
  const layout = useRef({ width: 0, height: 0 })

  useEffect(() => {
    ready.current = false
  }, [htmlRev])

  const pushAll = () => {
    if (!ready.current) return
    send(ref.current, {
      type: 'setMetal',
      hex: metalRef.current.hex,
      code: metalRef.current.code,
      purity: metalRef.current.purity,
    })
    send(ref.current, { type: 'setScale', scale: scaleRef.current })
    send(ref.current, { type: 'setTube', tube: tubeRef.current })
    send(ref.current, { type: 'setSetting', code: settingRef.current })
    send(ref.current, { type: 'setMarkers', markers: markersRef.current })
    if (layout.current.width > 0 && layout.current.height > 0) {
      send(ref.current, { type: 'resize', width: layout.current.width, height: layout.current.height })
    }
  }

  useEffect(() => {
    if (!ready.current) return
    send(ref.current, { type: 'setMetal', hex: metalHex, code: metalCode, purity: purityCode })
  }, [metalHex, metalCode, purityCode])

  useEffect(() => {
    if (!ready.current) return
    send(ref.current, { type: 'setScale', scale })
  }, [scale])

  useEffect(() => {
    if (!ready.current) return
    send(ref.current, { type: 'setTube', tube })
  }, [tube])

  useEffect(() => {
    if (!ready.current) return
    send(ref.current, { type: 'setSetting', code: settingCode })
  }, [settingCode])

  useEffect(() => {
    if (!ready.current) return
    send(ref.current, { type: 'setMarkers', markers })
  }, [markers])

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
          if (data !== 'ready') return
          ready.current = true
          pushAll()
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
