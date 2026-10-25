import { useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/src/theme/tokens'

type StudioSliderProps = {
  label: string
  /** The value as shown next to the label ("5.0 מ״מ · ≈ 0.52 קראט"). */
  valueLabel: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  disabled?: boolean
}

function snap(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round((value - min) / step) * step + min
  return Math.min(max, Math.max(min, Math.round(stepped * 1000) / 1000))
}

/**
 * A right-to-left slider (the low end on the right, like the band width): drag or tap the track;
 * a screen reader steps it with increment / decrement.
 */
export function StudioSlider({ label, valueLabel, value, min, max, step, onChange, disabled }: StudioSliderProps) {
  const trackRef = useRef<View>(null)
  const track = useRef({ x: 0, w: 1 })
  const span = max - min || 1
  const pct = Math.min(Math.max((value - min) / span, 0), 1)

  const measure = () => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      track.current = { x, w: Math.max(w, 1) }
    })
  }
  const fromPageX = (pageX: number) => {
    const { x, w } = track.current
    const t = Math.min(Math.max(1 - (pageX - x) / w, 0), 1)
    const next = snap(min + t * span, min, max, step)
    if (next !== value) onChange(next)
  }

  return (
    <View style={[styles.root, disabled && styles.off]}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{valueLabel}</Text>
      </View>
      <View
        ref={trackRef}
        style={styles.trackHit}
        onLayout={measure}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueLabel }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (disabled) return
          const delta = event.nativeEvent.actionName === 'increment' ? step : -step
          onChange(snap(value + delta, min, max, step))
        }}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          measure()
          fromPageX(event.nativeEvent.pageX)
        }}
        onResponderMove={(event) => fromPageX(event.nativeEvent.pageX)}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${pct * 100}%` }]} />
          <View style={[styles.thumb, { right: `${pct * 100}%` }]} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  off: { opacity: 0.45 },
  head: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    writingDirection: 'rtl',
  },
  value: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.textSecondary,
  },
  trackHit: {
    height: 32,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4DEF2',
    flexDirection: 'row-reverse',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  thumb: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 20,
    marginRight: -10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.brand,
  },
})
