import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StudioChips } from '@/src/components/studio/StudioChips'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type CatalogEntry = { code: string; label: string }

type StudioCatalogListProps = {
  catalog: CatalogEntry[]
  selected: Array<{ code: string; label: string }>
  onAdd: (code: string) => void
  onRemove: (index: number) => void
  extraActionLabel?: string
  onExtraAction?: () => void
  max?: number
}

export function StudioCatalogList({
  catalog,
  selected,
  onAdd,
  onRemove,
  extraActionLabel,
  onExtraAction,
  max,
}: StudioCatalogListProps) {
  const { t } = useTranslation()
  const atMax = max != null && selected.length >= max
  return (
    <View style={styles.root}>
      <StudioChips
        wrap
        disabled={atMax}
        items={catalog.map((item) => ({ id: item.code, label: item.label }))}
        onSelect={onAdd}
      />
      {max != null ? (
        <Text style={styles.limit}>
          {t('studioCatalogLimit').replace('{{count}}', String(max))}
        </Text>
      ) : null}
      {onExtraAction && extraActionLabel ? (
        <Pressable onPress={onExtraAction} disabled={atMax}>
          <Text style={[styles.upload, atMax ? styles.uploadOff : null]}>{extraActionLabel}</Text>
        </Pressable>
      ) : null}
      {selected.length === 0 ? (
        <Text style={styles.empty}>{t('studioEmptyList')}</Text>
      ) : (
        selected.map((item, index) => (
          <View key={`${item.code}-${index}`} style={styles.row}>
            <Pressable onPress={() => onRemove(index)}>
              <Text style={styles.remove}>{t('studioRemove')}</Text>
            </Pressable>
            <Text style={styles.name}>{item.label}</Text>
          </View>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  empty: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
    flex: 1,
  },
  remove: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.brand,
  },
  upload: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.brand,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  uploadOff: {
    opacity: 0.4,
  },
  limit: {
    fontFamily: 'Heebo',
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
