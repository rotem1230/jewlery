import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StudioSlider } from '@/src/components/studio/StudioSlider'
import { EARRING_ORBIT_MAX_MM, MAX_ROTATION_DEG, type PlacementControls } from '@/src/lib/jewelryCatalog.generated'
import type { StudioPlacement } from '@/src/lib/studioParams'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioPlacementControlsProps = {
  controls: PlacementControls
  placement: StudioPlacement
  /** The angle shown while the item is still in its automatic place. */
  shownAngleDeg: number
  /** A ring band's width: how far across it the item can go. */
  bandWidthMm: number
  onChange: (next: StudioPlacement) => void
  /** Dragging on the 3D model moves this item. */
  moving: boolean
  onToggleMove: () => void
}

/** Where an item sits: along the piece, across the band (or from the earring's centre), its turn. */
export function StudioPlacementControls({
  controls,
  placement,
  shownAngleDeg,
  bandWidthMm,
  onChange,
  moving,
  onToggleMove,
}: StudioPlacementControlsProps) {
  const { t } = useTranslation()
  const mm = t('studioMm')
  const half = Math.max(0, Math.round((bandWidthMm / 2) * 10) / 10)
  const angle = placement.angleDeg ?? shownAngleDeg

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('studioPosition')}</Text>
        {controls.angle ? (
          <Pressable
            onPress={onToggleMove}
            style={[styles.move, moving && styles.moveOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: moving }}
          >
            <Text style={[styles.moveLabel, moving && styles.moveLabelOn]}>
              {moving ? t('studioMoveDone') : t('studioMoveOnModel')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {moving ? <Text style={styles.hint}>{t('studioMoveOnModelOn')}</Text> : null}
      {controls.angle ? (
        <StudioSlider
          label={t('studioPositionAlong')}
          valueLabel={placement.angleDeg == null ? `${t('studioPositionAuto')} · ${Math.round(angle)}°` : `${Math.round(angle)}°`}
          value={angle}
          min={0}
          max={359}
          step={1}
          onChange={(angleDeg) => onChange({ ...placement, angleDeg })}
        />
      ) : (
        <Text style={styles.hint}>{t('studioPositionCentre')}</Text>
      )}
      {controls.across === 'BAND' && half > 0 ? (
        <StudioSlider
          label={t('studioPositionAcrossBand')}
          valueLabel={`${placement.offsetMm.toFixed(1)} ${mm}`}
          value={Math.min(half, Math.max(-half, placement.offsetMm))}
          min={-half}
          max={half}
          step={0.1}
          onChange={(offsetMm) => onChange({ ...placement, offsetMm })}
        />
      ) : null}
      {controls.across === 'DISTANCE' ? (
        <StudioSlider
          label={t('studioPositionDistance')}
          valueLabel={placement.offsetMm > 0 ? `${placement.offsetMm.toFixed(1)} ${mm}` : t('studioPositionAuto')}
          value={Math.max(0, placement.offsetMm)}
          min={0}
          max={EARRING_ORBIT_MAX_MM}
          step={0.5}
          onChange={(offsetMm) => onChange({ ...placement, offsetMm })}
        />
      ) : null}
      {controls.rotation ? (
        <StudioSlider
          label={t('studioPositionRotation')}
          valueLabel={`${Math.round(placement.rotationDeg)}°`}
          value={placement.rotationDeg}
          min={-MAX_ROTATION_DEG}
          max={MAX_ROTATION_DEG}
          step={5}
          onChange={(rotationDeg) => onChange({ ...placement, rotationDeg })}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  head: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    writingDirection: 'rtl',
  },
  move: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  moveOn: { backgroundColor: colors.brand },
  moveLabel: { fontFamily: 'Heebo', fontSize: 12, color: colors.brand, fontWeight: '600' },
  moveLabelOn: { color: colors.textInverse },
  hint: {
    fontFamily: 'Heebo',
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
