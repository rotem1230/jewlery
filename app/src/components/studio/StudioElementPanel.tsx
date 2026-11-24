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
  elementHosts,
  itemControls,
  placedOnElement,
  shownAngleDeg,
  withoutElement,
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

/**
 * The elements tab, in clear sections (the client's notes of 23.11): the elements on the piece,
 * each with its own ✕ to remove it; the one chosen, to edit (text, style, size, place); then
 * adding one — a category, then an element of the sheet (or a picture of one's own).
 */
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
  const [category, setCategory] = useState<ElementCategory>(ELEMENT_CATEGORIES[0].code)
  const nameOf = (element: StudioElement) => {
    if (element.customUploadId) return t('studioCustomElement')
    const def = element.elementCode === 'INITIAL' ? null : elementDef(element.elementCode)
    if (!def) return element.elementCode === 'INITIAL' ? (en ? 'Initial' : 'אות') : element.elementCode ?? ''
    return en ? def.labelEn : def.labelHe
  }
  const current = elements[selected] ?? null
  const update = (next: StudioElement) => onChange(elements.map((element, i) => (i === selected ? next : element)))
  const remove = (index: number) => {
    // Elements put on the one removed get a place of their own again.
    onChange(withoutElement(elements, index))
    // The chosen one stays chosen (one before it removed: it moves back by one); the chosen one
    // removed: the next one is chosen, or the one before when it was the last.
    const next = index < selected ? selected - 1 : index === selected ? Math.min(selected, elements.length - 2) : selected
    onSelect(Math.max(0, next))
  }
  const atMax = elements.length >= STUDIO_MAX_ELEMENTS
  const inCategory = ELEMENTS.filter((def) => def.category === category && (offered.length === 0 || offered.includes(def.code)))

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('studioElementsInPiece')}</Text>
      {elements.length === 0 ? (
        <Text style={styles.hint}>{t('studioElementsEmpty')}</Text>
      ) : (
        <>
          <View style={styles.list}>
            {elements.map((element, index) => {
              const name = nameOf(element)
              const on = index === selected
              return (
                <View key={`e${index}`} style={[styles.item, on && styles.itemOn]}>
                  <Pressable
                    onPress={() => onSelect(index)}
                    style={styles.itemName}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.itemLabel, on && styles.itemLabelOn]} numberOfLines={1}>
                      {`${name}${element.text ? ` "${element.text}"` : ''}${
                        element.placement.onElement != null && elements[element.placement.onElement]
                          ? ` · ${t('studioElementOnShort').replace('{{name}}', nameOf(elements[element.placement.onElement]))}`
                          : ''
                      }`}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => remove(index)}
                    hitSlop={8}
                    style={styles.itemRemove}
                    accessibilityRole="button"
                    accessibilityLabel={t('studioRemoveItem').replace('{{name}}', name)}
                  >
                    <Text style={styles.itemRemoveMark}>✕</Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
          <Text style={styles.hint}>{t('studioElementRemoveHint')}</Text>
        </>
      )}

      {current ? (
        <ElementEditor
          element={current}
          index={selected}
          slot={elements.slice(0, selected).filter((element) => element.placement.onElement == null).length}
          name={nameOf(current)}
          hosts={elementHosts(elements, selected).map((i) => ({
            index: i,
            label: `${nameOf(elements[i])}${elements[i].text ? ` "${elements[i].text}"` : ''}`,
            sizeMm: elements[i].sizeMm,
          }))}
          hostName={current.placement.onElement != null && elements[current.placement.onElement] ? nameOf(elements[current.placement.onElement]) : null}
          itemType={itemType}
          parameters={parameters}
          bandWidthMm={bandWidthMm}
          moving={moving}
          onToggleMove={onToggleMove}
          onChange={update}
          onRemove={() => remove(selected)}
        />
      ) : null}

      <View style={styles.addSection}>
        <Text style={styles.title}>{t('studioElementAddTitle')}</Text>
        <Text style={styles.hint}>{t('studioElementAddSteps')}</Text>
        <StudioChips
          items={ELEMENT_CATEGORIES.map((c) => ({ id: c.code, label: en ? c.labelEn : c.labelHe, selected: c.code === category }))}
          onSelect={(id) => setCategory(id as ElementCategory)}
        />
        <StudioChips
          wrap
          disabled={atMax}
          items={inCategory.map((def) => ({ id: def.code, label: `+ ${en ? def.labelEn : def.labelHe}` }))}
          onSelect={(code) => {
            onAdd(code)
            onSelect(elements.length)
          }}
        />
        <Pressable onPress={onUpload} disabled={atMax} accessibilityRole="button">
          <Text style={[styles.upload, atMax && styles.off]}>{t('studioUploadElement')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('studioCatalogLimit').replace('{{count}}', String(STUDIO_MAX_ELEMENTS))}</Text>
      </View>
    </View>
  )
}

type ElementEditorProps = {
  element: StudioElement
  index: number
  /**
   * Its place among the elements that stand on their own (not put on another): the piece's first
   * such element is its pendant / face, as the geometry draws it.
   */
  slot: number
  name: string
  /** The elements this one can be put in the middle of (a name in a Star of David). */
  hosts: Array<{ index: number; label: string; sizeMm: number | null }>
  /** The element this one is put on, or null. */
  hostName: string | null
  itemType: StudioItemType
  parameters: Record<string, unknown>
  bandWidthMm: number
  moving: boolean
  onToggleMove: () => void
  onChange: (element: StudioElement) => void
  onRemove: () => void
}

function ElementEditor({
  element,
  index,
  slot,
  name,
  hosts,
  hostName,
  itemType,
  parameters,
  bandWidthMm,
  moving,
  onToggleMove,
  onChange,
  onRemove,
}: ElementEditorProps) {
  const { t } = useTranslation()
  const def = element.elementCode === 'INITIAL' ? null : elementDef(element.elementCode)
  const range = def ? { min: def.minMm, max: def.maxMm } : FREE_SIZE
  const size = element.sizeMm ?? Math.min(range.max, Math.max(range.min, 6))
  const mm = t('studioMm')
  const on = element.placement.onElement ?? null
  /** Puts it in the middle of `host` (null: back to a place of its own), sized to fit inside it. */
  const putOn = (host: number | null) => {
    const placement = placedOnElement(element.placement, host)
    const hostSize = hosts.find((h) => h.index === host)?.sizeMm ?? null
    const fits = hostSize == null || size <= hostSize * 0.6
    const fitted = Math.min(range.max, Math.max(range.min, Math.round(((hostSize ?? 0) * 0.45) * 2) / 2))
    onChange({ ...element, placement, ...(host != null && !fits ? { sizeMm: fitted } : {}) })
  }

  return (
    <View style={styles.editor}>
      <View style={styles.row}>
        <Pressable onPress={onRemove} accessibilityRole="button">
          <Text style={styles.remove}>{t('studioRemove')}</Text>
        </Pressable>
        <Text style={styles.section}>{t('studioElementEditTitle').replace('{{name}}', name)}</Text>
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
      {on != null ? <Text style={styles.hint}>{t('studioElementOnSizeHint')}</Text> : null}

      {hosts.length ? (
        <>
          <Text style={styles.section}>{t('studioElementOnTitle')}</Text>
          <Text style={styles.hint}>{t('studioElementOnHint')}</Text>
          <StudioChips
            wrap
            items={[
              { id: 'apart', label: t('studioElementApart'), selected: on == null },
              ...hosts.map((host) => ({
                id: String(host.index),
                label: t('studioElementOnChip').replace('{{name}}', host.label),
                selected: on === host.index,
              })),
            ]}
            onSelect={(id) => putOn(id === 'apart' ? null : Number(id))}
          />
        </>
      ) : null}

      <StudioPlacementControls
        ring={itemType === 'RING'}
        // Put on another element: it sits in that one's middle; only its own turn is left.
        controls={on != null ? { angle: false, across: null, rotation: true } : itemControls(itemType, 'ELEMENT', slot, parameters)}
        centreLabel={on != null && hostName ? t('studioElementOnShort').replace('{{name}}', hostName) : undefined}
        placement={element.placement}
        // A chain's first element standing on its own hangs at the bottom; the others keep their own.
        shownAngleDeg={shownAngleDeg(itemType, 'ELEMENT', (itemType === 'NECKLACE' || itemType === 'BRACELET') && slot === 0 ? 0 : index, element.placement, parameters)}
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
  title: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  item: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: 18,
    paddingRight: 12,
    paddingLeft: 6,
    paddingVertical: 4,
    gap: 6,
    maxWidth: '100%',
  },
  itemOn: { borderColor: colors.brand, backgroundColor: '#EFECF8' },
  itemName: { flexShrink: 1 },
  itemLabel: { fontFamily: 'Heebo', fontSize: 13, color: colors.ink },
  itemLabelOn: { color: colors.brand, fontWeight: '600' },
  itemRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1EEFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRemoveMark: { fontSize: 11, color: colors.brand, fontWeight: '700' },
  addSection: {
    gap: 8,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
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
