import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ChevronDown } from 'lucide-react-native'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { CheckerBackdrop } from '@/src/components/home/CheckerBackdrop'
import { Button } from '@/src/components/ui/Button'
import { FilterOptionsSheet } from '@/src/components/chats/FilterOptionsSheet'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import {
  CATEGORY_CODE,
  listMetals,
  listWizardSizeCharts,
  metalChoices,
  parseMetalChoice,
} from '@/src/api/masterData'
import { createWizardDesign, wizardFailAlert } from '@/src/lib/wizard'
import { RING_SIZE_FALLBACK, ringSizeOptions, type RingSizeOption } from '@/src/lib/ringSizes'
import { NECKLACE_STYLES, necklaceStyleForLength, necklaceStyleLabel } from '@/src/lib/necklaceLengths'
import type { HomeStackParamList } from '@/src/navigation/types'
import necklineShallow from '../../../assets/images/categories/neckline-shallow.png'
import necklineMedium from '../../../assets/images/categories/neckline-medium.png'
import necklineDeep from '../../../assets/images/categories/neckline-deep.png'
import wristMeasureImage from '../../../assets/images/categories/wrist-measure.png'

const NECKLINE_IMAGE_BY_DEPTH = {
  shallow: necklineShallow,
  medium: necklineMedium,
  deep: necklineDeep,
} as const

type Nav = NativeStackNavigationProp<HomeStackParamList, 'SizeSelect'>
type Route = RouteProp<HomeStackParamList, 'SizeSelect'>

/** PRD necklace styles (Choker / Princess / Matinee / Opera), one length each. */
const NECKLACE_LENGTHS = NECKLACE_STYLES.map((style) => String(style.lengthCm))
const DEFAULT_NECKLACE_LENGTH = String(NECKLACE_STYLES.find((style) => style.code === 'PRINCESS')?.lengthCm ?? 45)

const CATEGORY_TITLE_KEY: Record<'ring' | 'necklace' | 'bracelet', TranslationKey> = {
  ring: 'categoryRing',
  necklace: 'categoryNecklace',
  bracelet: 'categoryBracelet',
}

/**
 * Figma "בחירת מידה" — step 2 of the design wizard, branches by category:
 * ring gets the IL/US size chart from the server (one row per size, IL paired with US; the PRD
 * chart only offline), necklace gets the PRD lengths, bracelet a wrist measurement.
 */
export function SizeSelectScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const category = route.params.category as 'ring' | 'necklace' | 'bracelet'
  const isRing = category === 'ring'
  const isBracelet = category === 'bracelet'

  const chartsQuery = useAsyncData(
    (signal) => listWizardSizeCharts(CATEGORY_CODE[category], signal),
    { deps: [category] },
  )
  const metalsQuery = useAsyncData((signal) => listMetals(signal), { deps: [] })
  const choices = metalChoices(metalsQuery.data ?? [], locale)

  // The server chart; the PRD chart only when it cannot be loaded (offline) or is empty.
  const chartsFailed = Boolean(chartsQuery.error) && !chartsQuery.loading
  const ringOptions = useMemo<RingSizeOption[]>(() => {
    if (!isRing) return []
    const charts = chartsQuery.data
    if (charts && charts.length > 0) return ringSizeOptions(charts)
    if (charts || chartsFailed) return ringSizeOptions(RING_SIZE_FALLBACK)
    return []
  }, [chartsFailed, chartsQuery.data, isRing])

  // A necklace chart from the server (lengthCm rows) wins; otherwise the PRD styles.
  const lengths = useMemo(() => {
    const charts = chartsQuery.data ?? []
    if (category !== 'necklace' || charts.length === 0) return NECKLACE_LENGTHS
    const fromCharts = charts
      .map((chart) => (chart.lengthCm != null && chart.lengthCm !== '' ? String(Number(chart.lengthCm)) : ''))
      .filter(Boolean)
    return fromCharts.length ? fromCharts : NECKLACE_LENGTHS
  }, [category, chartsQuery.data])

  const [standardSelected, setStandardSelected] = useState(true)
  const [ringSizeId, setRingSizeId] = useState<string | null>(null)
  const [lengthValue, setLengthValue] = useState(DEFAULT_NECKLACE_LENGTH)
  const [wristCm, setWristCm] = useState('16.5')
  const [busy, setBusy] = useState(false)
  const [metalId, setMetalId] = useState('YELLOW_GOLD:14K')
  const [metalOpen, setMetalOpen] = useState(false)

  const selectedMetal = choices.find((choice) => choice.id === metalId) ?? choices[0]
  const metalLabel = selectedMetal?.label ?? t('designMetalLabel')

  const onContinue = async () => {
    if (isRing && !ringSizeId) {
      Alert.alert(t('authErrorTitle'), t('sizeNeedRingSize'))
      return
    }
    if (isBracelet) {
      const wrist = parseFloat(wristCm.replace(',', '.'))
      if (!Number.isFinite(wrist) || wrist < 10 || wrist > 30) {
        Alert.alert(t('authErrorTitle'), t('sizeNeedWrist'))
        return
      }
    }
    setBusy(true)
    try {
      const title = t(CATEGORY_TITLE_KEY[category])
      const metal = parseMetalChoice(selectedMetal?.id ?? metalId)
      const selectedRing = ringOptions.find((option) => option.id === ringSizeId)
      const parameters =
        category === 'ring'
          ? {
              size: {
                standard: selectedRing?.standard ?? 'US',
                sizeCode: selectedRing?.sizeCode ?? (ringSizeId as string),
              },
              metal,
            }
          : category === 'bracelet'
            ? {
                size: { wristCircumferenceCm: parseFloat(wristCm.replace(',', '.')) },
                metal,
              }
            : {
                size: { necklaceLengthCm: parseFloat(lengthValue) || Number(DEFAULT_NECKLACE_LENGTH) },
                metal,
              }
      const id = await createWizardDesign(category, title, parameters)
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
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.headingBlock}>
            <Text style={styles.step}>{t('sizeStepLabel')}</Text>
            <Text style={styles.heading}>
              {isBracelet
                ? `${t('sizeHeadingPrefixNoSpace')}${t(CATEGORY_TITLE_KEY[category])}`
                : `${t('sizeHeadingPrefix')} ${t(CATEGORY_TITLE_KEY[category])}`}
            </Text>
          </View>

          {isBracelet ? (
            <View style={styles.braceletCard}>
              <Text style={styles.braceletTitle}>{t('sizeBraceletTitle')}</Text>
              <Text style={styles.braceletSubtitle}>{t('sizeBraceletSubtitle')}</Text>
              <View style={styles.braceletInputRow}>
                <Text style={styles.braceletUnit}>{t('sizeCm')}</Text>
                <TextInput
                  value={wristCm}
                  onChangeText={setWristCm}
                  keyboardType="decimal-pad"
                  style={styles.braceletInput}
                />
              </View>
              <Image source={wristMeasureImage} style={styles.wristImage} resizeMode="contain" />
            </View>
          ) : isRing ? (
            <View style={styles.list}>
              <TouchableOpacity
                onPress={() => {
                  setStandardSelected(true)
                  setRingSizeId(null)
                }}
                style={[styles.row, styles.standardRow, standardSelected && styles.rowSelected]}
              >
                <RadioDot selected={standardSelected} />
                <Text style={styles.standardLabel}>{t('sizeStandard')}</Text>
              </TouchableOpacity>

              {ringOptions.length === 0 ? <ActivityIndicator color={colors.brand} /> : null}
              {ringOptions.map((option) => {
                const selected = !standardSelected && ringSizeId === option.id
                return (
                  <TouchableOpacity
                    key={option.id}
                    accessibilityLabel={option.label}
                    onPress={() => {
                      setStandardSelected(false)
                      setRingSizeId(option.id)
                    }}
                    style={[styles.row, selected && styles.rowSelected]}
                  >
                    <RadioDot selected={selected} />
                    <View style={styles.ringInfo}>
                      {option.us ? <Text style={styles.ringUs}>{option.us}</Text> : null}
                      {option.diameter ? (
                        <Text style={styles.ringDiameter}>
                          {t('sizeDiameterLabel')} {option.diameter} {t('sizeMm')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.ringSize}>{option.size}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : (
            <View style={styles.list}>
              {lengths.map((cm, index) => {
                const selected = lengthValue === cm
                const depth = index === 0 ? 'shallow' : index === lengths.length - 1 ? 'deep' : 'medium'
                const style = necklaceStyleForLength(Number(cm))
                return (
                  <TouchableOpacity
                    key={cm}
                    onPress={() => setLengthValue(cm)}
                    style={[styles.lengthRow, selected && styles.rowSelected]}
                  >
                    <RadioDot selected={selected} />
                    <View style={styles.lengthInfo}>
                      <Text style={styles.lengthValue}>
                        {cm} {t('sizeCm')}
                      </Text>
                      {style ? <Text style={styles.lengthStyle}>{necklaceStyleLabel(style, locale)}</Text> : null}
                    </View>
                    <Image
                      source={NECKLINE_IMAGE_BY_DEPTH[depth]}
                      style={styles.necklineImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          <TouchableOpacity onPress={() => navigation.navigate('MeasurementGuide', { category })}>
            <Text style={styles.guideLink}>{t('sizeGuideHint')}</Text>
          </TouchableOpacity>

          {choices.length > 0 ? (
            <TouchableOpacity
              style={styles.metalRow}
              onPress={() => setMetalOpen(true)}
              activeOpacity={0.8}
            >
              <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={styles.metalValue}>{metalLabel}</Text>
              <Text style={styles.metalLabel}>{t('designMetalLabel')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant="primary"
          fullWidth
          disabled={busy || (isRing && !ringSizeId)}
          onPress={() => void onContinue()}
        >
          {t('sizeContinueCta')}
        </Button>
      </View>
      <FilterOptionsSheet
        visible={metalOpen}
        options={choices.map((choice) => ({ id: choice.id, label: choice.label }))}
        onSelect={(option) => {
          setMetalId(option.id)
          setMetalOpen(false)
        }}
        onRequestClose={() => setMetalOpen(false)}
      />
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
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
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
    gap: 8,
  },
  row: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
  },
  standardRow: {
    justifyContent: 'center',
  },
  rowSelected: {
    borderColor: colors.brand,
    borderWidth: 2,
  },
  standardLabel: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'center',
  },
  ringInfo: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  ringUs: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  ringDiameter: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ringSize: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  braceletCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  braceletTitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  braceletSubtitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  braceletInputRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    paddingHorizontal: 20,
  },
  braceletUnit: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    writingDirection: 'rtl',
  },
  braceletInput: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 28,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'left',
    padding: 0,
  },
  necklineImage: {
    width: 48,
    height: 60,
  },
  wristImage: {
    width: '100%',
    height: 220,
  },
  lengthRow: {
    width: '100%',
    minHeight: 108,
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
  lengthInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  lengthStyle: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  lengthValue: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  guideLink: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metalRow: {
    width: '100%',
    minHeight: 44,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  metalLabel: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  metalValue: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footer: {
    width: '100%',
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
})
