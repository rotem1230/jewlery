import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Metal } from '@/src/types/api'
import { StudioChips } from '@/src/components/studio/StudioChips'
import { metalHexFromCode, type StudioMetal } from '@/src/lib/studioParams'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioMetalPanelProps = {
  metals: Metal[]
  value: StudioMetal
  onChange: (next: StudioMetal) => void
  disabled?: boolean
}

export function StudioMetalPanel({ metals, value, onChange, disabled }: StudioMetalPanelProps) {
  const { t, locale } = useTranslation()
  const selected = metals.find((metal) => metal.code === value.metalCode) ?? metals[0]
  const purities = selected?.purities ?? []

  return (
    <View style={styles.root}>
      <View style={styles.swatches}>
        {metals.map((metal) => {
          const on = metal.code === value.metalCode
          return (
            <Pressable
              key={metal.code}
              disabled={disabled}
              onPress={() => {
                const purityCode = metal.purities[0]?.code ?? value.purityCode
                onChange({ metalCode: metal.code, purityCode })
              }}
              style={styles.swatchItem}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: metalHexFromCode(metal.code) },
                  on && styles.swatchOn,
                ]}
              />
              <Text style={[styles.swatchLabel, on && styles.swatchLabelOn]} numberOfLines={2}>
                {locale === 'en' && metal.labelEn ? metal.labelEn : metal.labelHe}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {purities.some((purity) => /K$/i.test(purity.code)) ? (
        <>
          <Text style={styles.sub}>{t('studioKaratLabel')}</Text>
          <StudioChips
            disabled={disabled}
            items={purities.map((purity) => ({
              id: purity.code,
              label: purity.labelHe ?? purity.code,
              selected: purity.code === value.purityCode,
            }))}
            onSelect={(purityCode) => onChange({ ...value, purityCode })}
          />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  swatches: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 4,
  },
  swatchItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  swatchOn: {
    borderWidth: 2,
    borderColor: colors.brand,
  },
  swatchLabel: {
    fontFamily: 'Heebo',
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  swatchLabelOn: {
    color: colors.brand,
    fontWeight: '500',
  },
  sub: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
