import { Image, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { RulerIcon } from '@/src/components/icons/RulerIcon'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import {
  getMeasurementGuide,
  itemTypeIdForCategory,
  measurementGuideTable,
  measurementGuideTips,
} from '@/src/api/masterData'
import { necklaceGuideLines } from '@/src/lib/necklaceLengths'
import type { HomeStackParamList } from '@/src/navigation/types'
import ringImage from '../../../assets/images/categories/ring.png'
import necklaceImage from '../../../assets/images/categories/necklace.png'
import braceletImage from '../../../assets/images/categories/bracelet.png'
import neckMeasureImage from '../../../assets/images/categories/neck-measure-guide.png'
import handsMeasureImage from '../../../assets/images/categories/hands-measure-guide.png'

type Nav = NativeStackNavigationProp<HomeStackParamList, 'MeasurementGuide'>
type Route = RouteProp<HomeStackParamList, 'MeasurementGuide'>
type GuideCategory = 'ring' | 'necklace' | 'bracelet'

const TITLE_KEY: Record<GuideCategory, TranslationKey> = {
  ring: 'categoryRing',
  necklace: 'categoryNecklace',
  bracelet: 'categoryBracelet',
}

const QUESTION_KEY: Record<GuideCategory, TranslationKey> = {
  ring: 'guideQuestionRing',
  necklace: 'guideQuestionNecklace',
  bracelet: 'guideQuestionBracelet',
}

const BODY_KEY: Record<GuideCategory, TranslationKey> = {
  ring: 'guideBodyRing',
  necklace: 'guideBodyNecklace',
  bracelet: 'guideBodyBracelet',
}

const BADGE_IMAGE_BY_CATEGORY: Record<GuideCategory, ImageSourcePropType> = {
  ring: ringImage,
  necklace: necklaceImage,
  bracelet: braceletImage,
}

/**
 * Figma "*-measurement-guide" — how-to-measure reference per category.
 */
export function MeasurementGuideScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const category = route.params.category as GuideCategory

  const guideQuery = useAsyncData(
    async (signal) => {
      const itemTypeId = await itemTypeIdForCategory(category, signal)
      if (!itemTypeId) return null
      return getMeasurementGuide(itemTypeId, locale, signal)
    },
    { deps: [category, locale] },
  )
  const liveGuide = guideQuery.data
  const liveTips = measurementGuideTips(liveGuide?.body)
  const liveTable = measurementGuideTable(liveGuide?.body)
  const liveTitle = liveGuide?.title?.trim()

  return (
    <View style={styles.root}>
      <HomeHeader onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.iconBadge}>
            <Image
              source={BADGE_IMAGE_BY_CATEGORY[category]}
              style={styles.badgeImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>{t(TITLE_KEY[category])}</Text>

          <View style={styles.card}>
            <View style={styles.questionRow}>
              <View style={styles.questionIcon}>
                <RulerIcon size={16} />
              </View>
              <Text style={styles.question}>{liveTitle || t(QUESTION_KEY[category])}</Text>
            </View>

            {liveTips.length > 0 ? (
              <View style={styles.bulletList}>
                {liveTips.map((tip) => (
                  <Text key={tip} style={styles.bullet}>
                    {tip}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.body}>{t(BODY_KEY[category])}</Text>
            )}

            {liveTable.length > 0 ? (
              <View style={styles.bulletList}>
                {liveTable.map((row) => (
                  <Text key={`${row.standard ?? ''}-${row.sizeCode}`} style={styles.bullet}>
                    {row.standard && row.standard !== 'IL' ? `${row.standard} ` : ''}
                    {row.sizeCode}
                    {row.us ? ` · US ${row.us}` : ''}
                    {row.diameterMm ? ` · ${row.diameterMm} ${t('sizeMm')}` : ''}
                  </Text>
                ))}
              </View>
            ) : null}

            {category === 'necklace' ? (
              <>
                <View style={styles.bulletList}>
                  {necklaceGuideLines(locale).map((line) => (
                    <Text key={line} style={styles.bullet}>
                      {line}
                    </Text>
                  ))}
                </View>
                <Image
                  source={neckMeasureImage}
                  style={styles.neckImage}
                  resizeMode="contain"
                />
              </>
            ) : null}

            {category === 'bracelet' ? (
              <Image
                source={handsMeasureImage}
                style={styles.handsImage}
                resizeMode="contain"
              />
            ) : null}

            {category === 'ring' ? (
              <View style={styles.tipBox}>
                <Text style={styles.tip}>
                  <Text style={styles.tipBold}>{t('guideTipLabel')} </Text>
                  {t('guideTipRing')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

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
    paddingBottom: 40,
  },
  column: {
    width: '100%',
    maxWidth: 327,
    alignItems: 'center',
    gap: 16,
  },
  iconBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Heebo',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    gap: 16,
    marginTop: 8,
  },
  questionRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  questionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFECF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bulletList: {
    width: '100%',
    gap: 6,
  },
  bullet: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  badgeImage: {
    width: 56,
    height: 56,
  },
  neckImage: {
    width: '100%',
    height: 260,
  },
  handsImage: {
    width: '100%',
    height: 180,
  },
  tipBox: {
    width: '100%',
    backgroundColor: '#EFECF8',
    borderRadius: 12,
    padding: 16,
  },
  tip: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.brand,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tipBold: {
    fontWeight: '700',
  },
})
