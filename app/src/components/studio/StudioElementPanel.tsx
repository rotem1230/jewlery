import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { StudioChips } from '@/src/components/studio/StudioChips'
import { StudioPlacementControls } from '@/src/components/studio/StudioPlacementControls'
import { StudioSlider } from '@/src/components/studio/StudioSlider'
import {
  ELEMENTS,
  ELEMENT_CATEGORIES,
  MAX_ELEMENT_TEXT,
  elementDef,
  elementText,
  type ElementCategory,
} from '@/src/lib/jewelryCatalog.generated'
import {
  STUDIO_MAX_ELEMENTS,
  itemControls,
  shownAngleDeg,
  type StudioElement,
  type StudioItemType,
} from '@/src/lib/studioParams'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioElementPanelProps = {
  itemType: StudioItemType
  elements: StudioElement[]
  onChange: (elements: StudioElement[]) => void
  /** Adds a catalogue element (the screen sizes it for where it goes). */
  onAdd: (elementCode: string) => void
  /** Picks and uploads a personal element picture. */
  onUpload: () => void
  /** The elements the server offers (codes); empty = every element of the sheet. */
  offered: string[]
  parameters: Record<string, unknown>
  bandWidthMm: number
  selected: number
  onSelect: (index: number) => void
  moving: boolean
  onToggleMove: () => void
}

/** Custom pictures and the older round initial: no sheet range of their own. */
const FREE_SIZE = { min: 3, max: 20 }

/** The elements tab: the element sheet by category, a name or a date, style, size and place. */
export function StudioElementPanel({
  itemType,
  elements,
  onChange,
  onAdd,
  onUpload,
  offered,
  parameters,
  bandWidthMm,
  selected,
  onSelect,
  moving,
  onToggleMove,
}: StudioElementPanelProps) {
  const { t, locale } = useTranslation()
  const en = locale === 'en'
  const [adding, setAdding] = useState(elements.length === 0)
  const [category, setCategory] = useState<ElementCategory>(ELEMENT_CATEGORIES[0].code)
  const nameOf = (element: StudioElement) => {
    if (element.customUploadId) return t('studioCustomElement')
    const def = element.elementCode === 'INITIAL' ? null : elementDef(element.elementCode)
    if (!def) return element.elementCode === 'INITIAL' ? (en ? 'Initial' : 'אות') : element.elementCode ?? ''
    return en ? def.labelEn : def.labelHe
  }
  const current = adding ? null : elements[selected] ?? null
  const update = (next: StudioElement) => onChange(elements.map((element, i) => (i === selected ? next : element)))
  const atMax = elements.length >= STUDIO_MAX_ELEMENTS
  const inCategory = ELEMENTS.filter((def) => def.category === category && (offered.length === 0 || offered.includes(def.code)))

  return (
    <View style={styles.root}>
      <StudioChips
        items={[
          ...elements.map((element, index) => ({
            id: `e${index}`,
            label: `${nameOf(element)}${element.text ? ` "${element.text}"` : ''}`,
            selected: !adding && index === selected,
          })),
          ...(atMax ? [] : [{ id: 'add', label: `+ ${t('studioElementAdd')}`, selected: adding }]),
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
        <View style={styles.editor}>
          <StudioChips
            items={ELEMENT_CATEGORIES.map((c) => ({ id: c.code, label: en ? c.labelEn : c.labelHe, selected: c.code === category }))}
            onSelect={(id) => setCategory(id as ElementCategory)}
          />
          <StudioChips
            wrap
            disabled={atMax}
            items={inCategory.map((def) => ({ id: def.code, label: en ? def.labelEn : def.labelHe }))}
            onSelect={(code) => {
              onAdd(code)
              onSelect(elements.length)
              setAdding(false)
            }}
          />
          <Pressable onPress={onUpload} disabled={atMax} accessibilityRole="button">
            <Text style={[styles.upload, atMax && styles.off]}>{t('studioUploadElement')}</Text>
          </Pressable>
          <Text style={styles.hint}>{t('studioCatalogLimit').replace('{{count}}', String(STUDIO_MAX_ELEMENTS))}</Text>
        </View>
      ) : null}

      {current ? (
        <ElementEditor
          element={current}
          index={selected}
          name={nameOf(current)}
          itemType={itemType}
          parameters={parameters}
          bandWidthMm={bandWidthMm}
          moving={moving}
          onToggleMove={onToggleMove}
          onChange={update}
          onRemove={() => {
            onChange(elements.filter((_, i) => i !== selected))
            onSelect(Math.max(0, selected - 1))
            if (elements.length <= 1) setAdding(true)
          }}
        />
      ) : null}
    </View>
  )
}

type ElementEditorProps = {
  element: StudioElement
  index: number
  name: string
  itemType: StudioItemType
  parameters: Record<string, unknown>
  bandWidthMm: number
  moving: boolean
  onToggleMove: () => void
  onChange: (element: StudioElement) => void
  onRemove: () => void
}

function ElementEditor({ element, index, name, itemType, parameters, bandWidthMm, moving, onToggleMove, onChange, onRemove }: ElementEditorProps) {
  const { t } = useTranslation()
  const def = element.elementCode === 'INITIAL' ? null : elementDef(element.elementCode)
  const range = def ? { min: def.minMm, max: def.maxMm } : FREE_SIZE
  const size = element.sizeMm ?? Math.min(range.max, Math.max(range.min, 6))
  const mm = t('studioMm')

  return (
    <View style={styles.editor}>
      <View style={styles.row}>
        <Pressable onPress={onRemove} accessibilityRole="button">
          <Text style={styles.remove}>{t('studioRemove')}</Text>
        </Pressable>
        <Text style={styles.section}>{name}</Text>
      </View>

      {def?.text ? (
        <View style={styles.editor}>
          <Text style={styles.section}>{t('studioElementText')}</Text>
          <TextInput
            testID="element-text"
            value={element.text ?? ''}
            onChangeText={(text) => onChange({ ...element, text: elementText(def, text) })}
            maxLength={MAX_ELEMENT_TEXT * 2}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType={def.text === 'DIGITS' ? 'number-pad' : 'default'}
            style={styles.input}
          />
          <Text style={styles.hint}>{t(def.text === 'DIGITS' ? 'studioElementTextDigits' : 'studioElementTextLetters')}</Text>
        </View>
      ) : null}

      {def && def.variants.length ? (
        <>
          <Text style={styles.section}>{t('studioElementStyle')}</Text>
          <StudioChips
            wrap
            items={def.variants.map((variant) => ({
              id: variant,
              label: t(`studioVariant${variant}` as TranslationKey),
              selected: variant === element.variant,
            }))}
            onSelect={(variant) => onChange({ ...element, variant })}
          />
        </>
      ) : null}

      <StudioSlider
        label={t('studioElementSize')}
        valueLabel={`${size.toFixed(1)} ${mm}`}
        value={size}
        min={range.min}
        max={range.max}
        step={0.5}
        onChange={(sizeMm) => onChange({ ...element, sizeMm })}
      />

      <StudioPlacementControls
        controls={itemControls(itemType, 'ELEMENT', index, parameters)}
        placement={element.placement}
        shownAngleDeg={shownAngleDeg(itemType, 'ELEMENT', index, element.placement, parameters)}
        bandWidthMm={bandWidthMm}
        onChange={(placement) => onChange({ ...element, placement })}
        moving={moving}
        onToggleMove={onToggleMove}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
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
  input: {
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Heebo',
    fontSize: 16,
    color: colors.ink,
    textAlign: 'right',
  },
  hint: {
    fontFamily: 'Heebo',
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  upload: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.brand,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  off: { opacity: 0.4 },
})
