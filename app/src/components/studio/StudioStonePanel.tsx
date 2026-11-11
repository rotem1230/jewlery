import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StudioChips } from '@/src/components/studio/StudioChips'
import { StudioColorGrid } from '@/src/components/studio/StudioColorGrid'
import { StudioPlacementControls } from '@/src/components/studio/StudioPlacementControls'
import { StudioSlider } from '@/src/components/studio/StudioSlider'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { CUTS, STONES, allowedCuts, paletteColor, stoneDef } from '@/src/lib/jewelryCatalog.generated'
import {
  STUDIO_MAX_STONES,
  addStone,
  caratLabel,
  itemControls,
  shownAngleDeg,
  stoneSizeRange,
  withCut,
  withStoneCode,
  type StudioItemType,
  type StudioPlacement,
  type StudioStone,
} from '@/src/lib/studioParams'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioStonePanelProps = {
  itemType: StudioItemType
  stones: StudioStone[]
  onChange: (stones: StudioStone[]) => void
  /** The stones the server offers (codes); empty = every stone of the catalogue. */
  offered: string[]
  /** What the viewer builds now: decides how each stone can move. */
  parameters: Record<string, unknown>
  bandWidthMm: number
  selected: number
  onSelect: (index: number) => void
  /** The stone being moved by dragging on the model, if any. */
  moving: boolean
  onToggleMove: () => void
  /** The ring's band of small stones (its name), whose stones the setting tab chooses. */
  bandName?: string | null
  onOpenBand?: () => void
}

/** The stone tab: the client's stones, their cuts, chart colours, size up to 1.5 ct and place. */
export function StudioStonePanel({
  itemType,
  stones,
  onChange,
  offered,
  parameters,
  bandWidthMm,
  selected,
  onSelect,
  moving,
  onToggleMove,
  bandName,
  onOpenBand,
}: StudioStonePanelProps) {
  const { t, locale } = useTranslation()
  const [adding, setAdding] = useState(stones.length === 0)
  const en = locale === 'en'
  const catalog = STONES.filter((stone) => offered.length === 0 || offered.includes(stone.code))
  const stoneName = (code: string) => {
    const def = stoneDef(code)
    return def ? (en ? def.nameEn : def.nameHe) : code
  }
  const current = adding ? null : stones[selected] ?? null
  const update = (next: StudioStone) => onChange(stones.map((stone, i) => (i === selected ? next : stone)))
  const controlsFor = (index: number) => itemControls(itemType, 'STONE', index, parameters)
  const labelFor = (index: number) => {
    const centre = index === 0 && (itemType === 'EARRINGS' || (itemType === 'RING' && controlsFor(0).across === null))
    return centre ? t('studioStoneCentre') : t('studioStoneN').replace('{{n}}', String(index + 1))
  }

  const add = (code: string) => {
    const next = addStone(itemType, stones, code)
    if (next === stones) return
    onChange(next)
    onSelect(next.length - 1)
    setAdding(false)
  }
  const remove = () => {
    onChange(stones.filter((_, i) => i !== selected))
    onSelect(Math.max(0, selected - 1))
    if (stones.length <= 1) setAdding(true)
  }

  return (
    <View style={styles.root}>
      {bandName ? (
        <View style={styles.band}>
          <Text style={styles.info}>{t('studioStoneBandHint').replace('{{band}}', bandName)}</Text>
          {onOpenBand ? (
            <BrandButton label={t('studioStoneBandOpen')} variant="outline" hug flex={false} onPress={onOpenBand} />
          ) : null}
        </View>
      ) : null}
      <StudioChips
        items={[
          ...stones.map((stone, index) => ({
            id: `s${index}`,
            label: `${labelFor(index)} · ${stoneName(stone.stoneCode)}`,
            selected: !adding && index === selected,
            swatch: paletteColor(stone.colorCode)?.hex,
          })),
          ...(stones.length < STUDIO_MAX_STONES ? [{ id: 'add', label: `+ ${t('studioStoneAdd')}`, selected: adding }] : []),
        ]}
        onSelect={(id) => {
          if (id === 'add') {
            setAdding(true)
            return
          }
          setAdding(false)
          onSelect(Number(id.slice(1)))
        }}
      />

      {adding ? (
        <StudioChips wrap items={catalog.map((stone) => ({ id: stone.code, label: en ? stone.nameEn : stone.nameHe }))} onSelect={add} />
      ) : null}

      {current ? (
        <StoneEditor
          stone={current}
          index={selected}
          itemType={itemType}
          catalog={catalog.map((stone) => ({ id: stone.code, label: en ? stone.nameEn : stone.nameHe }))}
          parameters={parameters}
          bandWidthMm={bandWidthMm}
          moving={moving}
          onToggleMove={onToggleMove}
          onChange={update}
          onRemove={remove}
        />
      ) : null}
    </View>
  )
}

type StoneEditorProps = {
  stone: StudioStone
  index: number
  itemType: StudioItemType
  catalog: Array<{ id: string; label: string }>
  parameters: Record<string, unknown>
  bandWidthMm: number
  moving: boolean
  onToggleMove: () => void
  onChange: (stone: StudioStone) => void
  onRemove: () => void
}

function StoneEditor({ stone, index, itemType, catalog, parameters, bandWidthMm, moving, onToggleMove, onChange, onRemove }: StoneEditorProps) {
  const { t, locale } = useTranslation()
  const en = locale === 'en'
  const def = stoneDef(stone.stoneCode)
  const range = stoneSizeRange(stone.stoneCode, stone.cutCode)
  const size = stone.sizeMm ?? Math.min(range.max, Math.max(range.min, index === 0 ? 5 : 2.5))
  const mm = t('studioMm')
  const info = def
    ? [
        def.hardness ? `${t('studioStoneHardness')}: ${def.hardness}` : null,
        (en ? def.marketColorsEn : def.marketColorsHe).length
          ? `${t('studioStoneMarketColors')}: ${(en ? def.marketColorsEn : def.marketColorsHe).join(', ')}`
          : null,
        (en ? def.roundCutEn : def.roundCutHe) ? `${t('studioStoneRoundCut')}: ${en ? def.roundCutEn : def.roundCutHe}` : null,
        en ? def.notesEn : def.notesHe,
      ].filter(Boolean)
    : []

  return (
    <View style={styles.editor}>
      <View style={styles.row}>
        <Pressable onPress={onRemove} accessibilityRole="button">
          <Text style={styles.remove}>{t('studioRemove')}</Text>
        </Pressable>
        <Text style={styles.section}>{t('studioStoneKind')}</Text>
      </View>
      <StudioChips
        items={catalog.map((item) => ({ ...item, selected: item.id === stone.stoneCode }))}
        onSelect={(code) => onChange(withStoneCode(stone, code))}
      />
      {info.length ? <Text style={styles.info}>{info.join(' · ')}</Text> : null}

      <Text style={styles.section}>{t('studioStoneCut')}</Text>
      <StudioChips
        wrap
        items={allowedCuts(stone.stoneCode).map((cut) => {
          const cutDef = CUTS.find((c) => c.code === cut)
          return { id: cut, label: cutDef ? (en ? cutDef.labelEn : cutDef.labelHe) : cut, selected: cut === stone.cutCode }
        })}
        onSelect={(cut) => onChange(withCut(stone, cut as StudioStone['cutCode']))}
      />

      <Text style={styles.section}>{t('studioStoneColor')}</Text>
      <StudioColorGrid value={stone.colorCode} onChange={(colorCode) => onChange({ ...stone, colorCode })} />

      <StudioSlider
        label={t('studioStoneSize')}
        valueLabel={`${size.toFixed(1)} ${mm} · ${caratLabel(stone.stoneCode, stone.cutCode, size, locale)}`}
        value={size}
        min={range.min}
        max={range.max}
        step={0.1}
        onChange={(sizeMm) => onChange({ ...stone, sizeMm })}
      />

      <StudioPlacementControls
        controls={itemControls(itemType, 'STONE', index, parameters)}
        placement={stone.placement}
        shownAngleDeg={shownAngleDeg(itemType, 'STONE', index, stone.placement, parameters)}
        bandWidthMm={bandWidthMm}
        onChange={(placement: StudioPlacement) => onChange({ ...stone, placement })}
        moving={moving}
        onToggleMove={onToggleMove}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  band: { gap: 6, alignItems: 'flex-end' },
  editor: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  remove: { fontFamily: 'Heebo', fontSize: 13, color: colors.brand },
  info: {
    fontFamily: 'Heebo',
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
