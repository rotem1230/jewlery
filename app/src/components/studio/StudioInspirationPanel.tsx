import { StyleSheet, Text, TextInput, View } from 'react-native'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { useTranslation } from '@/src/i18n'
import { colors, radii } from '@/src/theme/tokens'

type StudioInspirationPanelProps = {
  note: string
  jewelerNotes: string
  hasImage: boolean
  generating?: boolean
  onChangeNote: (value: string) => void
  onChangeJewelerNotes: (value: string) => void
  onUpload: () => void
  onGenerate: () => void
}

export function StudioInspirationPanel({
  note,
  jewelerNotes,
  hasImage,
  generating = false,
  onChangeNote,
  onChangeJewelerNotes,
  onUpload,
  onGenerate,
}: StudioInspirationPanelProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.root}>
      <BrandButton label={hasImage ? t('studioInspirationReplace') : t('studioInspirationUpload')} onPress={onUpload} disabled={generating} />
      <BrandButton
        label={generating ? t('studioInspirationGenerating') : t('studioInspirationGenerate')}
        onPress={onGenerate}
        disabled={generating}
      />
      <Text style={styles.hint}>{t('studioInspirationSampleHint')}</Text>
      <Text style={styles.label}>{t('studioPersonalNote')}</Text>
      <TextInput
        value={note}
        onChangeText={onChangeNote}
        multiline
        textAlignVertical="top"
        style={styles.input}
        placeholder={t('studioPersonalNotePlaceholder')}
        placeholderTextColor={colors.formPlaceholder}
        editable={!generating}
      />
      <Text style={styles.label}>{t('studioJewelerNotes')}</Text>
      <TextInput
        value={jewelerNotes}
        onChangeText={onChangeJewelerNotes}
        multiline
        textAlignVertical="top"
        style={styles.input}
        placeholder={t('studioJewelerNotesPlaceholder')}
        placeholderTextColor={colors.formPlaceholder}
        editable={!generating}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  hint: {
    fontFamily: 'Heebo',
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: radii.md,
    padding: 12,
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
