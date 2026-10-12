import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Diamond, Droplet } from 'lucide-react-native'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { CheckerBackdrop } from '@/src/components/home/CheckerBackdrop'
import { Button } from '@/src/components/ui/Button'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { createWizardDesign, wizardFailAlert } from '@/src/lib/wizard'
import type { HomeStackParamList } from '@/src/navigation/types'

type Nav = NativeStackNavigationProp<HomeStackParamList, 'StyleSelect'>
type Route = RouteProp<HomeStackParamList, 'StyleSelect'>

type StyleOption = {
  id: string
  labelKey: TranslationKey
  Icon: typeof Diamond
}

const EARRING_STYLES: StyleOption[] = [
  { id: 'drop', labelKey: 'styleEarringDrop', Icon: Droplet },
  { id: 'stud', labelKey: 'styleEarringStud', Icon: Diamond },
]

const CATEGORY_TITLE_KEY: Record<string, TranslationKey> = {
  earrings: 'categoryEarrings',
}

/**
 * Figma "בחירת סגנון" — step 2 for earrings: pick drop vs. stud silhouette.
 */
export function StyleSelectScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const category = route.params.category

  const [selectedId, setSelectedId] = useState<string>('stud')
  const [busy, setBusy] = useState(false)

  const onContinue = async () => {
    setBusy(true)
    try {
      const id = await createWizardDesign(category, t('categoryEarrings'), {
        size: { earringStyleCode: selectedId },
      })
      navigation.navigate('DesignStudio', { designId: id })
    } catch (err) {
      wizardFailAlert(t('designCreateFailed'), err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <CheckerBackdrop />
      <HomeHeader onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View style={styles.column}>
          <View style={styles.headingBlock}>
            <Text style={styles.step}>{t('sizeStepLabel')}</Text>
            <Text style={styles.heading}>
              {t('styleHeadingPrefix')} {t(CATEGORY_TITLE_KEY[category] ?? 'categoryEarrings')}
            </Text>
          </View>

          <View style={styles.list}>
            {EARRING_STYLES.map(({ id, labelKey, Icon }) => {
              const selected = selectedId === id
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setSelectedId(id)}
                  style={[styles.row, selected && styles.rowSelected]}
                >
                  <RadioDot selected={selected} />
                  <Text style={styles.rowLabel}>{t(labelKey)}</Text>
                  <View style={[styles.swatch, selected && styles.swatchSelected]}>
                    <Icon
                      size={22}
                      color={selected ? colors.brand : colors.textSecondary}
                      strokeWidth={1.5}
                    />
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          variant="primary"
          fullWidth
          disabled={busy}
          onPress={() => void onContinue()}
        >
          {t('sizeContinueCta')}
        </Button>
      </View>
    </View>
  )
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <View style={[dotStyles.outer, selected && dotStyles.outerSelected]}>
      {selected ? <View style={dotStyles.inner} /> : null}
    </View>
  )
}

const dotStyles = StyleSheet.create({
  outer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C6C5D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerSelected: {
    borderColor: colors.brand,
  },
  inner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
  },
})

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.homeBg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  column: {
    width: '100%',
    maxWidth: 327,
    gap: 24,
  },
  headingBlock: {
    width: '100%',
    gap: 4,
  },
  step: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    color: '#565A8E',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heading: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: {
    width: '100%',
    gap: 12,
  },
  row: {
    width: '100%',
    minHeight: 80,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
  },
  rowSelected: {
    borderColor: colors.brand,
    borderWidth: 2,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    backgroundColor: '#EFECF8',
  },
  footer: {
    width: '100%',
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
})
