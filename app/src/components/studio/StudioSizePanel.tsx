import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { SizeChartRow } from '@/src/types/api'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'
import {
  BAND_WIDTH_MAX_MM,
  BAND_WIDTH_MIN_MM,
  DEFAULT_WRIST_CM,
  clampBandWidthMm,
  type StudioSize,
} from '@/src/lib/studioParams'
import { NECKLACE_STYLES, necklaceStyleForLength } from '@/src/lib/necklaceLengths'
import { RING_SIZE_FALLBACK, customRingSize, ringSizeLabel, ringSizeOptions } from '@/src/lib/ringSizes'
import { SHANK_STYLES } from '@/src/lib/jewelryCatalog.generated'
import { StudioChips } from '@/src/components/studio/StudioChips'

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
  /** The size was locked (an older studio offered to lock it): nothing changes until it is opened. */
  locked?: boolean
  onUnlock?: () => void
  /** A save or an unlock is running: the unlock button waits. */
  busy?: boolean
  /** Whether a size typed in is not one (so "סיימתי" waits for a size that is). */
  onCustomInvalid?: (invalid: boolean) => void
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
      // The panel scrolls: a drag that drifts up or down stays on the slider.
      onResponderTerminationRequest={() => false}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
        <View style={[styles.thumb, { right: `${pct * 100}%` }]} />
      </View>
    </View>
  )
}

/**
 * Figma Size tab: the ring's band width, and — so a draft can be reused (the client's notes of
 * 23.11) — its size (every size, or one typed in) and its shank (single, split, double, triple).
 */
export function StudioSizePanel({
  itemType,
  charts,
  value,
  onChange,
  onMeasureGuide,
  locked,
  onUnlock,
  busy,
  onCustomInvalid,
}: StudioSizePanelProps) {
  const { t, locale } = useTranslation()
  const en = locale === 'en'
  const necklaceStyle = necklaceStyleForLength(value.necklaceLengthCm)
  const [wristText, setWristText] = useState(() => String(value.wristCircumferenceCm ?? DEFAULT_WRIST_CM))
  const [customText, setCustomText] = useState('')
  const sizes = useMemo(() => ringSizeOptions(charts.length > 0 ? charts : RING_SIZE_FALLBACK), [charts])
  const customInvalid = customText.trim() !== '' && !customRingSize(customText)
  // While a size is still being typed ("5", "53.") it is not called wrong yet.
  const customStillTyping = /^d?$|[.,]$/.test(customText.trim())
  useEffect(() => {
    onCustomInvalid?.(customInvalid)
  }, [customInvalid, onCustomInvalid])
  useEffect(() => () => onCustomInvalid?.(false), [onCustomInvalid])
  const edit = (next: StudioSize) => {
    if (!locked) onChange(next)
  }

  return (
    <View style={styles.root}>
      {locked ? (
        <View style={styles.lockBox}>
          <Text style={styles.coming}>{t('studioSizeLocked')}</Text>
          {onUnlock ? (
            <Pressable
              onPress={onUnlock}
              disabled={busy}
              style={[styles.unlock, busy ? styles.unlockBusy : null]}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(busy) }}
            >
              <Text style={styles.unlockLabel}>{t('studioUnlockSize')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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

          <View style={styles.bandRow}>
            <Text style={styles.bandMm}>{ringSizeLabel(value)}</Text>
            <Text style={styles.bandTitle}>{t('studioRingSizeTitle')}</Text>
          </View>
          <StudioChips
            wrap
            items={sizes.map((option) => ({
              id: option.id,
              label: option.size,
              selected: option.standard === value.standard && option.sizeCode === value.sizeCode,
            }))}
            onSelect={(id) => {
              const option = sizes.find((row) => row.id === id)
              if (option) {
                setCustomText('')
                edit({ ...value, standard: option.standard, sizeCode: option.sizeCode })
              }
            }}
          />
          <TextInput
            testID="custom-ring-size"
            value={customText}
            editable={!locked}
            onChangeText={(text) => {
              setCustomText(text)
              const custom = customRingSize(text)
              if (custom) edit({ ...value, ...custom })
            }}
            placeholder={t('sizeCustomPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('sizeCustomPlaceholder')}
            keyboardType="decimal-pad"
            maxLength={5}
            style={styles.wristInput}
          />
          {customInvalid && !customStillTyping ? <Text style={styles.error}>{t('sizeCustomInvalid')}</Text> : null}

          <Text style={styles.bandTitle}>{t('studioShankTitle')}</Text>
          <StudioChips
            wrap
            items={SHANK_STYLES.map((style) => ({
              id: style.code,
              label: en ? style.labelEn : style.labelHe,
              selected: style.code === (value.shankStyle ?? 'SINGLE'),
            }))}
            onSelect={(shankStyle) => edit({ ...value, shankStyle })}
          />
        </>
      ) : null}

      {itemType === 'NECKLACE' ? (
        <View style={styles.chipsWrap}>
          {NECKLACE_STYLES.map((style) => {
            // A saved length inside the style's PRD range (e.g. 42 cm, Princess) selects it.
            const selected = necklaceStyle?.code === style.code
            return (
              <Pressable
                key={style.code}
                onPress={() => edit({ ...value, necklaceLengthCm: style.lengthCm })}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>
                  {locale === 'en' ? style.labelEn : style.labelHe} ·{' '}
                  {selected ? value.necklaceLengthCm : style.lengthCm} {t('sizeCm')}
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

      {itemType !== 'EARRINGS' ? (
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
  lockBox: {
    gap: 8,
    alignItems: 'flex-end',
  },
  unlock: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  unlockBusy: { opacity: 0.5 },
  unlockLabel: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand,
  },
  error: {
    fontFamily: 'Heebo',
    fontSize: 12,
    color: '#B42318',
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
