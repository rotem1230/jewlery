import { StyleSheet, Text, View } from 'react-native'
import type { SettingItem } from '@/src/types/api'
import { StudioChips } from '@/src/components/studio/StudioChips'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type StudioSettingPanelProps = {
  settings: SettingItem[]
  selectedCode?: string
  onSelect: (code: string) => void
  itemTypeCode: string
}

export function StudioSettingPanel({
  settings,
  selectedCode,
  onSelect,
  itemTypeCode,
}: StudioSettingPanelProps) {
  const { t, locale } = useTranslation()
  const forType = settings.filter((setting) => {
    const types = setting.itemTypes ?? []
    if (types.length === 0) return true
    return types.some((row) => row.itemType?.code === itemTypeCode || row.itemTypeId === itemTypeCode)
  })
  const list = forType.length > 0 ? forType : settings

  if (list.length === 0) {
    return <Text style={styles.empty}>{t('studioNoSettings')}</Text>
  }

  return (
    <View style={styles.root}>
      <StudioChips
        wrap
        items={list.map((setting) => ({
          id: setting.code,
          label: locale === 'en' && setting.labelEn ? setting.labelEn : setting.labelHe,
          selected: setting.code === selectedCode,
        }))}
        onSelect={onSelect}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  empty: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
