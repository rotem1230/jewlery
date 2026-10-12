import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { SizeChartRow } from '@/src/types/api'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'
import {
  BAND_WIDTH_MAX_MM,
  BAND_WIDTH_MIN_MM,
  DEFAULT_WRIST_CM,
  NECKLACE_LENGTHS_CM,
  clampBandWidthMm,
  type StudioSize,
} from '@/src/lib/studioParams'

const EARRING_LABEL: Record<string, TranslationKey> = {
  drop: 'styleEarringDrop',
  stud: 'styleEarringStud',
}

type StudioSizePanelProps = {
  itemType: 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS'
  charts: SizeChartRow[]
  value: StudioSize
  onChange: (next: StudioSize) => void
  onMeasureGuide: () => void
  locked?: boolean
}

function BandWidthSlider({ value, onChange }: { value: number; onChange: (mm: number) => void }) {
  const trackRef = useRef<View>(null)
  const track = useRef({ x: 0, w: 1 })
  const pct = (clampBandWidthMm(value) - BAND_WIDTH_MIN_MM) / (BAND_WIDTH_MAX_MM - BAND_WIDTH_MIN_MM)

  const measure = () => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      track.current = { x, w: Math.max(w, 1) }
    })
  }

  const fromPageX = (pageX: number) => {
    const { x, w } = track.current
    const t = Math.min(Math.max(1 - (pageX - x) / w, 0), 1)
    onChange(clampBandWidthMm(BAND_WIDTH_MIN_MM + t * (BAND_WIDTH_MAX_MM - BAND_WIDTH_MIN_MM)))
  }

  return (
    <View
      ref={trackRef}
      style={styles.trackHit}
      onLayout={measure}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        measure()
        fromPageX(event.nativeEvent.pageX)
      }}
      onResponderMove={(event) => fromPageX(event.nativeEvent.pageX)}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
        <View style={[styles.thumb, { right: `${pct * 100}%` }]} />
      </View>
    </View>
  )
}

/** Figma Size tab: ring thickness sheet (chart already ran before studio). */
export function StudioSizePanel({
  itemType,
  charts: _charts,
  value,
  onChange,
  onMeasureGuide,
  locked,
}: StudioSizePanelProps) {
  const { t } = useTranslation()
  const [wristText, setWristText] = useState(() => String(value.wristCircumferenceCm ?? DEFAULT_WRIST_CM))
  const edit = (next: StudioSize) => {
    if (!locked) onChange(next)
  }

  return (
    <View style={styles.root}>
      {locked ? <Text style={styles.coming}>{t('studioSizeLocked')}</Text> : null}
      {itemType === 'RING' ? (
        <>
          <View style={styles.bandRow}>
            <Text style={styles.bandMm}>{value.bandWidthMm.toFixed(1)}mm</Text>
            <Text style={styles.bandTitle}>{t('studioBandTitle')}</Text>
          </View>
          <BandWidthSlider
            value={value.bandWidthMm}
            onChange={(bandWidthMm) => edit({ ...value, bandWidthMm })}
          />
        </>
      ) : null}

      {itemType === 'NECKLACE' ? (
        <View style={styles.chipsWrap}>
          {NECKLACE_LENGTHS_CM.map((cm) => {
            const selected = value.necklaceLengthCm === cm
            return (
              <Pressable
                key={cm}
                onPress={() => edit({ ...value, necklaceLengthCm: cm })}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>
                  {cm} {t('sizeCm')}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {itemType === 'BRACELET' ? (
        <View style={styles.wristRow}>
          <Text style={styles.chipLabel}>{t('sizeCm')}</Text>
          <TextInput
            value={wristText}
            onChangeText={(text) => {
              setWristText(text)
              const n = Number(text.replace(',', '.'))
              if (Number.isFinite(n)) edit({ ...value, wristCircumferenceCm: n })
            }}
            keyboardType="decimal-pad"
            style={styles.wristInput}
          />
        </View>
      ) : null}

      {itemType === 'EARRINGS' ? (
        <Text style={styles.coming}>
          {t('studioEarringStyleLabel')}:{' '}
          {value.earringStyleCode && EARRING_LABEL[value.earringStyleCode]
            ? t(EARRING_LABEL[value.earringStyleCode])
            : value.earringStyleCode ?? '—'}
        </Text>
      ) : null}

      {itemType !== 'RING' && itemType !== 'EARRINGS' ? (
        <Pressable onPress={onMeasureGuide}>
          <Text style={styles.guide}>{t('sizeGuideHint')}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  chipsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.brand,
    backgroundColor: '#EFECF8',
  },
  chipLabel: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.ink,
  },
  chipLabelOn: {
    color: colors.brand,
    fontWeight: '600',
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bandTitle: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
  bandMm: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  trackHit: {
    height: 36,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E4EA',
  },
  trackFill: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  thumb: {
    position: 'absolute',
    top: -12,
    marginRight: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 3,
  },
  wristRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  wristInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Heebo',
    fontSize: 16,
    textAlign: 'right',
    color: colors.ink,
  },
  coming: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guide: {
    fontFamily: 'Heebo',
    fontSize: 12,
    color: colors.brand,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
})
