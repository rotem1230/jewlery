import { StyleSheet, Text, View } from 'react-native'
import type { SettingItem } from '@/src/types/api'
import { StudioChips } from '@/src/components/studio/StudioChips'
import { StudioColorGrid } from '@/src/components/studio/StudioColorGrid'
import { StudioSlider } from '@/src/components/studio/StudioSlider'
import { BAND_STONE_SIZES_MM, SETTINGS, STONES, settingDef, stoneDef } from '@/src/lib/jewelryCatalog.generated'
import { newBand, type StudioBand, type StudioItemType, type StudioSetting } from '@/src/lib/studioParams'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

/** Most stones in one band row (the geometry's bound; fewer when they do not fit around the ring). */
const MAX_BAND_STONES_HINT = 60

type StudioSettingPanelProps = {
  /** The settings the server offers for the piece (master data); empty = the whole catalogue. */
  settings: SettingItem[]
  itemTypeCode: StudioItemType
  value: StudioSetting
  onChange: (setting: StudioSetting) => void
  /** The band stones the server offers (codes); empty = every stone. */
  offeredStones: string[]
}

/** Whether the server offers a setting for this kind of piece (no links = every piece). */
function offeredFor(setting: SettingItem, itemTypeCode: string): boolean {
  const types = setting.itemTypes ?? []
  if (types.length === 0) return true
  return types.some((row) => row.itemType?.code === itemTypeCode || row.itemTypeId === itemTypeCode)
}

/**
 * The setting tab: the centre stone's head (the head pictures), and on a ring the stones set in
 * the band (the band pictures) with their stone, colour, size from the pavé table, rows and place.
 */
export function StudioSettingPanel({ settings, itemTypeCode, value, onChange, offeredStones }: StudioSettingPanelProps) {
  const { t, locale } = useTranslation()
  const en = locale === 'en'
  const offered = settings.filter((setting) => offeredFor(setting, itemTypeCode)).map((setting) => setting.code)
  const allowed = (code: string) => offered.length === 0 || offered.includes(code)
  const label = (code: string) => {
    const def = settingDef(code)
    return def ? (en ? def.labelEn : def.labelHe) : code
  }
  const heads = SETTINGS.filter((s) => s.kind === 'HEAD' && allowed(s.code))
  const bands = itemTypeCode === 'RING' ? SETTINGS.filter((s) => s.kind === 'BAND' && allowed(s.code)) : []
  const band = value.band

  return (
    <View style={styles.root}>
      <Text style={styles.section}>{t('studioHeadTitle')}</Text>
      <StudioChips
        wrap
        items={[
          { id: 'NONE', label: t('studioNone'), selected: value.headCode === 'NONE' },
          ...heads.map((s) => ({ id: s.code, label: label(s.code), selected: s.code === value.headCode })),
        ]}
        onSelect={(headCode) => onChange({ ...value, headCode })}
      />

      {bands.length ? (
        <>
          <Text style={styles.section}>{t('studioBandSettingTitle')}</Text>
          <StudioChips
            wrap
            items={[
              { id: 'NONE', label: t('studioNone'), selected: !band },
              ...bands.map((s) => ({ id: s.code, label: label(s.code), selected: s.code === band?.settingCode })),
            ]}
            onSelect={(code) => {
              if (code === 'NONE') onChange({ ...value, band: null })
              else if (code !== band?.settingCode) {
                // Another style keeps the stones chosen, with as many rows as it takes.
                const fresh = newBand(code)
                const def = settingDef(code)
                const rows = band ? Math.min(def?.maxRows ?? 1, Math.max(def?.minRows ?? 1, band.rows)) : fresh.rows
                onChange({ ...value, band: band ? { ...band, settingCode: code, rows } : fresh })
              }
            }}
          />
          {band ? <BandEditor band={band} offeredStones={offeredStones} onChange={(next) => onChange({ ...value, band: next })} /> : null}
        </>
      ) : null}
    </View>
  )
}

function BandEditor({ band, offeredStones, onChange }: { band: StudioBand; offeredStones: string[]; onChange: (band: StudioBand) => void }) {
  const { t, locale } = useTranslation()
  const en = locale === 'en'
  const def = settingDef(band.settingCode)
  const mm = t('studioMm')
  const stones = STONES.filter((stone) => offeredStones.length === 0 || offeredStones.includes(stone.code))

  return (
    <View style={styles.root}>
      <Text style={styles.section}>{t('studioBandStone')}</Text>
      <StudioChips
        items={stones.map((stone) => ({ id: stone.code, label: en ? stone.nameEn : stone.nameHe, selected: stone.code === band.stoneCode }))}
        onSelect={(stoneCode) => onChange({ ...band, stoneCode, colorCode: stoneDef(stoneCode)?.defaultColor ?? band.colorCode })}
      />
      <StudioColorGrid value={band.colorCode} onChange={(colorCode) => onChange({ ...band, colorCode })} />

      <Text style={styles.section}>{t('studioBandStoneSize')}</Text>
      <StudioChips
        wrap
        items={BAND_STONE_SIZES_MM.map((size) => ({ id: String(size), label: `${size} ${mm}`, selected: size === band.stoneSizeMm }))}
        onSelect={(size) => onChange({ ...band, stoneSizeMm: Number(size) })}
      />

      {def && def.maxRows > def.minRows ? (
        <>
          <Text style={styles.section}>{t('studioBandRows')}</Text>
          <StudioChips
            wrap
            items={Array.from({ length: def.maxRows - def.minRows + 1 }, (_, i) => def.minRows + i).map((rows) => ({
              id: String(rows),
              label: String(rows),
              selected: rows === band.rows,
            }))}
            onSelect={(rows) => onChange({ ...band, rows: Number(rows) })}
          />
        </>
      ) : null}

      <StudioSlider
        label={t('studioBandCount')}
        valueLabel={band.count == null ? t('studioPositionAuto') : String(band.count)}
        value={band.count ?? 0}
        min={0}
        max={MAX_BAND_STONES_HINT}
        step={1}
        onChange={(count) => onChange({ ...band, count: count === 0 ? null : count })}
      />
      <StudioSlider
        label={t('studioBandRowPosition')}
        valueLabel={`${Math.round(band.angleDeg)}°`}
        value={band.angleDeg}
        min={0}
        max={359}
        step={1}
        onChange={(angleDeg) => onChange({ ...band, angleDeg })}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  section: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
