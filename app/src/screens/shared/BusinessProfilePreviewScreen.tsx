import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { BusinessProfileSummary } from '@/src/components/jeweler/BusinessProfileSummary'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { addPortfolioItem, previewJewelerProfile, publishJewelerProfile } from '@/src/api/jewelerProfiles'
import { parseApiError } from '@/src/lib/api'
import { DAY_LABEL_KEYS, hoursRows } from '@/src/lib/businessHours'
import { portfolioItemsToAdd } from '@/src/lib/portfolio'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useTranslation } from '@/src/i18n'
import type { ProfileStackParamList } from '@/src/navigation/types'

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'BusinessProfilePreview'>
type Route = RouteProp<ProfileStackParamList, 'BusinessProfilePreview'>

/** Figma "תצוגה מקדימה" — read-only preview before publishing the business profile. */
export function BusinessProfilePreviewScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const [busy, setBusy] = useState(false)
  const { name, about, gallery } = route.params
  // The saved draft as it would be published: its opening hours and service area.
  const { data: draft } = useAsyncData(() => previewJewelerProfile(), { deps: [] })

  const onPublish = async () => {
    setBusy(true)
    try {
      await publishJewelerProfile()
      for (const item of portfolioItemsToAdd(gallery)) {
        await addPortfolioItem(item)
      }
      navigation.navigate('BusinessProfileView')
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('businessProfilePreviewTitle')} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <BusinessProfileSummary
            name={name}
            about={about}
            galleryTitle={t('businessProfileGalleryLabel')}
            // Only the jeweler's own pictures (never a stock photo for one without a picture).
            gallery={gallery.flatMap((item) =>
              item.uri ? [{ id: item.id, image: { uri: item.uri }, title: item.title ?? name }] : [],
            )}
            reviewsTitle={t('businessProfileReviewsLabel')}
            reviews={[]}
            reviewsEmptyLabel={t('businessProfileReviewsEmpty')}
            businessInfo={{
              hoursTitle: t('jwHoursLabel'),
              hours: hoursRows(draft?.businessHours).map((row) => ({
                label: t(DAY_LABEL_KEYS[row.day]),
                text: row.text,
              })),
              areaTitle: t('jwServiceAreaLabel'),
              area: draft?.serviceAreaText,
            }}
          />

          <View style={styles.actions}>
            <BrandButton
              label={t('businessProfilePublishCta')}
              variant="primary"
              flex={false}
              disabled={busy}
              onPress={() => void onPublish()}
            />
            <BrandButton
              label={t('businessProfileBackToEditCta')}
              variant="outline"
              flex={false}
              onPress={() => navigation.goBack()}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDF3FA',
  },
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  column: {
    width: '100%',
    gap: 16,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
})
