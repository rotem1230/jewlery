import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { useTranslation } from '@/src/i18n'
import { clampPlacement, placementInPhoto, type TryOnPlacementValue } from '@/src/lib/tryOnPlacement'
import { colors, radii } from '@/src/theme/tokens'

type TryOnPlacementProps = {
  visible: boolean
  /** The photo just picked (a local file URI). */
  photoUri: string
  /** Loads the transparent picture of the design (a `data:` URI); aborted when the screen closes. */
  loadOverlay: (signal: AbortSignal) => Promise<string>
  busy?: boolean
  onConfirm: (placement: TryOnPlacementValue) => void
  onCancel: () => void
}

const START: TryOnPlacementValue = { x: 0.5, y: 0.55, scale: 0.35, rotation: 0 }

/**
 * Lets the designer put their piece on their photo: drag with one finger, pinch / twist with two
 * (or the buttons). The placement is relative to the photo, so the server composes the same
 * picture at the same spot whatever the screen size.
 */
export function TryOnPlacement({ visible, photoUri, loadOverlay, busy = false, onConfirm, onCancel }: TryOnPlacementProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [placement, setPlacement] = useState<TryOnPlacementValue>(START)
  const [overlay, setOverlay] = useState<{ uri: string | null; failed: boolean }>({ uri: null, failed: false })
  const [overlayLoaded, setOverlayLoaded] = useState(false)
  const [overlayAttempt, setOverlayAttempt] = useState(0)
  const placementRef = useRef(placement)
  placementRef.current = placement
  const loadOverlayRef = useRef(loadOverlay)
  loadOverlayRef.current = loadOverlay

  useEffect(() => {
    setPlacement(START)
    setPhotoSize(null)
  }, [photoUri])

  useEffect(() => {
    const controller = new AbortController()
    setOverlay({ uri: null, failed: false })
    setOverlayLoaded(false)
    loadOverlayRef.current(controller.signal).then(
      (uri) => {
        if (!controller.signal.aborted) setOverlay({ uri, failed: false })
      },
      () => {
        if (!controller.signal.aborted) setOverlay({ uri: null, failed: true })
      },
    )
    return () => controller.abort()
  }, [photoUri, overlayAttempt])

  // Where the photo sits inside the frame (contain).
  const rect = useMemo(() => placementInPhoto(frame, photoSize), [frame, photoSize])
  const rectRef = useRef(rect)
  rectRef.current = rect

  const gesture = useRef<{
    start: TryOnPlacementValue
    pinchDistance: number
    pinchAngle: number
    /** Finger travel already used before the current single-finger stretch. */
    offsetX: number
    offsetY: number
    pinching: boolean
  } | null>(null)

  const twoFinger = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches
    if (touches.length < 2) return null
    const dx = touches[1].pageX - touches[0].pageX
    const dy = touches[1].pageY - touches[0].pageY
    return { distance: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI }
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const pair = twoFinger(event)
          gesture.current = {
            start: placementRef.current,
            pinchDistance: pair?.distance ?? 0,
            pinchAngle: pair?.angle ?? 0,
            offsetX: 0,
            offsetY: 0,
            pinching: Boolean(pair),
          }
        },
        onPanResponderMove: (event, state) => {
          const g = gesture.current
          const r = rectRef.current
          if (!g || r.width <= 0) return
          const pair = twoFinger(event)
          if (pair) {
            if (!g.pinching) {
              g.pinching = true
              g.pinchDistance = pair.distance
              g.pinchAngle = pair.angle
              g.start = placementRef.current
              return
            }
            setPlacement(
              clampPlacement({
                ...g.start,
                scale: g.start.scale * (pair.distance / g.pinchDistance),
                rotation: g.start.rotation + (pair.angle - g.pinchAngle),
              }),
            )
            return
          }
          if (g.pinching) {
            // Back to one finger: keep the pinched size / angle and drag on from here.
            g.pinching = false
            g.start = placementRef.current
            g.offsetX = state.dx
            g.offsetY = state.dy
            return
          }
          setPlacement(
            clampPlacement({
              ...g.start,
              x: g.start.x + (state.dx - g.offsetX) / r.width,
              y: g.start.y + (state.dy - g.offsetY) / r.height,
            }),
          )
        },
        onPanResponderRelease: () => {
          gesture.current = null
        },
        onPanResponderTerminate: () => {
          gesture.current = null
        },
      }),
    [],
  )

  const nudge = (change: Partial<TryOnPlacementValue>) =>
    setPlacement((p) => clampPlacement({ ...p, ...change }))

  const overlaySide = placement.scale * rect.width
  const ready = rect.width > 0 && overlayLoaded

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title}>{t('tryOnPlaceTitle')}</Text>
        <Text style={styles.hint}>{t('tryOnPlaceHint')}</Text>
        <View
          testID="try-on-frame"
          style={styles.frame}
          onLayout={(event: LayoutChangeEvent) => setFrame(event.nativeEvent.layout)}
          {...responder.panHandlers}
        >
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            // The loaded picture reports its size (Image.getSize cannot read picker content:// URIs).
            onLoad={(event) => {
              const { width, height } = event.nativeEvent.source
              if (width > 0 && height > 0) setPhotoSize({ width, height })
            }}
          />
          {rect.width > 0 && overlay.uri ? (
            <Image
              source={{ uri: overlay.uri }}
              onLoad={() => setOverlayLoaded(true)}
              onError={() => setOverlay({ uri: null, failed: true })}
              accessibilityLabel={t('tryOnOverlayA11y')}
              style={[
                styles.overlay,
                {
                  width: overlaySide,
                  height: overlaySide,
                  left: rect.x + placement.x * rect.width - overlaySide / 2,
                  top: rect.y + placement.y * rect.height - overlaySide / 2,
                  transform: [{ rotate: `${placement.rotation}deg` }],
                },
              ]}
            />
          ) : null}
          {overlay.failed ? (
            <View style={styles.failure}>
              <Text style={styles.failureText}>{t('tryOnOverlayFailed')}</Text>
              <Pressable
                onPress={() => setOverlayAttempt((n) => n + 1)}
                accessibilityRole="button"
                accessibilityLabel={t('commonRetry')}
                style={styles.retry}
              >
                <Text style={styles.retryLabel}>{t('commonRetry')}</Text>
              </Pressable>
            </View>
          ) : !ready ? (
            <ActivityIndicator style={styles.spinner} color={colors.brand} />
          ) : null}
        </View>
        <View style={styles.tools}>
          <ToolButton label="−" a11y={t('tryOnSmaller')} onPress={() => nudge({ scale: placement.scale / 1.1 })} />
          <ToolButton label="+" a11y={t('tryOnBigger')} onPress={() => nudge({ scale: placement.scale * 1.1 })} />
          <ToolButton label="↺" a11y={t('tryOnRotateLeft')} onPress={() => nudge({ rotation: placement.rotation - 10 })} />
          <ToolButton label="↻" a11y={t('tryOnRotateRight')} onPress={() => nudge({ rotation: placement.rotation + 10 })} />
        </View>
        <BrandButton label={t('tryOnConfirm')} onPress={() => onConfirm(placement)} disabled={!ready || busy} />
        <BrandButton label={t('tryOnCancel')} onPress={onCancel} variant="outline" disabled={busy} />
      </View>
    </Modal>
  )
}

function ToolButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tool} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={styles.toolLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10, backgroundColor: '#F6F2FF' },
  title: { fontFamily: 'Heebo', fontSize: 20, fontWeight: '600', color: colors.ink, textAlign: 'right', writingDirection: 'rtl' },
  hint: { fontFamily: 'Heebo', fontSize: 13, color: colors.textSecondary, textAlign: 'right', writingDirection: 'rtl' },
  frame: { flex: 1, borderRadius: radii.md, overflow: 'hidden', backgroundColor: '#1D1A24' },
  overlay: { position: 'absolute' },
  spinner: { position: 'absolute', top: '50%', left: '50%', marginLeft: -12, marginTop: -12 },
  failure: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: 'rgba(29, 26, 36, 0.8)',
  },
  failureText: { fontFamily: 'Heebo', fontSize: 15, color: '#FFFFFF', textAlign: 'center', writingDirection: 'rtl' },
  retry: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii.md, backgroundColor: '#FFFFFF' },
  retryLabel: { fontFamily: 'Heebo', fontSize: 15, fontWeight: '600', color: colors.brand },
  tools: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  tool: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: { fontFamily: 'Heebo', fontSize: 22, color: colors.brand },
})
