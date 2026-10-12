import { Image, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { CheckerBackdrop } from '@/src/components/home/CheckerBackdrop'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import type { HomeStackParamList, JewelryCategory } from '@/src/navigation/types'
import earringsImage from '../../../assets/images/categories/earrings.png'
import ringImage from '../../../assets/images/categories/ring.png'
import braceletImage from '../../../assets/images/categories/bracelet.png'
import necklaceImage from '../../../assets/images/categories/necklace.png'

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CategorySelect'>

type CategoryItem = {
  id: JewelryCategory
  labelKey: TranslationKey
  captionKey: TranslationKey
  image: ImageSourcePropType
}

// Figma bento grid — right column first (RTL reading order): earrings/ring, then bracelet/necklace.
const CATEGORIES: CategoryItem[] = [
  { id: 'earrings', labelKey: 'categoryEarrings', captionKey: 'categoryEarringsCaption', image: earringsImage },
  { id: 'ring', labelKey: 'categoryRing', captionKey: 'categoryRingCaption', image: ringImage },
  { id: 'bracelet', labelKey: 'categoryBracelet', captionKey: 'categoryBraceletCaption', image: braceletImage },
  { id: 'necklace', labelKey: 'categoryNecklace', captionKey: 'categoryNecklaceCaption', image: necklaceImage },
]

/**
 * Figma "התחל לעצב - בחירת סוג תכשיט" — step 1 of the design wizard.
 */
export function CategorySelectScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()

  return (
    <View style={styles.root}>
      <CheckerBackdrop />
      <HomeHeader onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View style={styles.column}>
          <View style={styles.headingBlock}>
            <Text style={styles.step}>{t('categoryStepLabel')}</Text>
            <Text style={styles.heading}>{t('categoryHeading')}</Text>
          </View>

          <View style={styles.grid}>
            {CATEGORIES.map(({ id, labelKey, captionKey, image }) => (
              <View key={id} style={styles.cardSlot}>
                <TouchableOpacity
                  onPress={() =>
                    id === 'earrings'
                      ? navigation.navigate('StyleSelect', { category: id })
                      : navigation.navigate('SizeSelect', { category: id })
                  }
                  activeOpacity={0.85}
                  style={styles.card}
                  accessibilityRole="button"
                >
                  <View style={styles.iconBadge}>
                    <Image source={image} style={styles.iconImage} resizeMode="contain" />
                  </View>
                  <Text style={styles.cardLabel}>{t(labelKey)}</Text>
                  <Text style={styles.cardCaption}>{t(captionKey)}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}

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
    gap: 32,
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
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  cardSlot: {
    width: '47%',
    flexGrow: 1,
  },
  card: {
    width: '100%',
    minHeight: 167,
    backgroundColor: colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 16,
  },
  cardPressed: {
    opacity: 0.85,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F5F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 36,
    height: 36,
  },
  cardLabel: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    color: colors.ink,
    textAlign: 'center',
  },
  cardCaption: {
    fontFamily: 'Heebo',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -8,
  },
})
