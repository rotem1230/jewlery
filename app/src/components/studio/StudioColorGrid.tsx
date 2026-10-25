import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { STONE_PALETTE, paletteColor, type PaletteGroup } from '@/src/lib/jewelryCatalog.generated'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioColorGridProps = {
  value: string
  onChange: (colorCode: string) => void
}

/** The client's colour chart: 62 colours and 34 effects, any of them for any stone. */
export function StudioColorGrid({ value, onChange }: StudioColorGridProps) {
  const { t } = useTranslation()
  const chosen = paletteColor(value)
  const [group, setGroup] = useState<PaletteGroup>(chosen?.group ?? 'COLOR')
  const swatches = STONE_PALETTE.filter((color) => color.group === group)

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={styles.tabs}>
          {(['COLOR', 'EFFECT'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => setGroup(g)}
              style={[styles.tab, group === g && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: group === g }}
            >
              <Text style={[styles.tabLabel, group === g && styles.tabLabelOn]}>
                {t(g === 'COLOR' ? 'studioPaletteColors' : 'studioPaletteEffects')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.name}>{chosen?.name ?? value}</Text>
      </View>
      <View style={styles.grid}>
        {swatches.map((color) => {
          const selected = color.code === value
          return (
            <Pressable
              key={color.code}
              testID={`color-${color.code}`}
              onPress={() => onChange(color.code)}
              style={[styles.ring, selected && styles.ringOn]}
              accessibilityRole="button"
              accessibilityLabel={color.name}
              accessibilityState={{ selected }}
            >
              <View style={[styles.swatch, { backgroundColor: color.hex }]} />
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  head: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabs: { flexDirection: 'row-reverse', gap: 6 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.formBorder,
  },
  tabOn: { borderColor: colors.brand, backgroundColor: '#EFECF8' },
  tabLabel: { fontFamily: 'Heebo', fontSize: 12, color: colors.ink },
  tabLabelOn: { color: colors.brand, fontWeight: '600' },
  name: { fontFamily: 'Heebo', fontSize: 13, color: colors.textSecondary },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  ring: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOn: { borderColor: colors.brand },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
})
