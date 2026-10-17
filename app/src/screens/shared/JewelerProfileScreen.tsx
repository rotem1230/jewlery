import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { GalleryWorkCard } from '@/src/components/atelier/GalleryWorkCard'
import { ReviewCard } from '@/src/components/atelier/ReviewCard'
import { QuoteItemSheet, type QuoteItemOption } from '@/src/components/atelier/QuoteItemSheet'
import { QuoteRequestSuccessModal } from '@/src/components/atelier/QuoteRequestSuccessModal'
import { BusinessInfoCard } from '@/src/components/jeweler/BusinessInfoCard'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { getPublicJewelerProfile } from '@/src/api/jewelerProfiles'
import { listDesigns } from '@/src/api/designs'
import { createAtelierRequest } from '@/src/api/atelier'
import { parseApiError } from '@/src/lib/api'
import { DAY_LABEL_KEYS, hoursRows } from '@/src/lib/businessHours'
import { uploadContentUrl } from '@/src/api/uploads'
import { formatHeTimeAgo } from '@/src/hooks/useMyBusinessProfile'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, radii } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { AtelierStackParamList } from '@/src/navigation/types'

type ProfileNav = NativeStackNavigationProp<AtelierStackParamList, 'JewelerProfile'>
type ProfileRoute = RouteProp<AtelierStackParamList, 'JewelerProfile'>

export function JewelerProfileScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<ProfileNav>()
  const route = useRoute<ProfileRoute>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const isDesigner = useAppSelector((s) => s.auth.user?.activeRole === 'DESIGNER')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)

  const load = useCallback(
    (signal: AbortSignal) => getPublicJewelerProfile(route.params.jewelerId, signal),
    [route.params.jewelerId],
  )
  const { data: profile, loading, error, retry } = useAsyncData(load, {
    deps: [route.params.jewelerId],
  })

  const designsQuery = useAsyncData((signal) => listDesigns({ status: 'PUBLISHED' }, signal), {
    deps: [accessToken],
    immediate: isDesigner,
  })

  const quoteOptions = useMemo<QuoteItemOption[]>(
    () =>
      (designsQuery.data?.items ?? []).map((design) => ({
        id: design.id,
        label: design.title || design.itemType?.labelHe || design.id,
      })),
    [designsQuery.data],
  )

  const onSelectItem = async (option: QuoteItemOption) => {
    setSheetOpen(false)
    try {
      await createAtelierRequest({
        designId: option.id,
        mode: 'TARGETED',
        targetJewelerProfileIds: [route.params.jewelerId],
      })
      setSuccessOpen(true)
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    }
  }

  const onRequestQuote = () => {
    if (quoteOptions.length === 0) {
      Alert.alert(t('authErrorTitle'), t('noPublishedDesigns'))
      return
    }
    setSheetOpen(true)
  }

  return (
    <View style={styles.root}>
      <HomeHeader backdropColor="#EDF3FA" showLogo />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {error && !profile && !loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : profile ? (
            <>
              <Text style={styles.name}>{profile.businessName}</Text>

              <View style={styles.aboutCard}>
                <View style={styles.aboutAccent} />
                <Text style={styles.aboutText}>{profile.bio ?? ''}</Text>
              </View>

              <BusinessInfoCard
                hoursTitle={t('jwHoursLabel')}
                hours={hoursRows(profile.businessHours).map((row) => ({
                  label: t(DAY_LABEL_KEYS[row.day]),
                  text: row.text,
                }))}
                areaTitle={t('jwServiceAreaLabel')}
                area={profile.serviceAreaText}
              />

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('jewelerGalleryTitle')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.galleryContent}
                  decelerationRate="fast"
                  nestedScrollEnabled
                >
                  {profile.portfolio.map((work) => (
                    <GalleryWorkCard
                      key={work.id}
                      image={{ uri: uploadContentUrl(work.uploadId) }}
                      title={work.title ?? ''}
                    />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('jewelerReviewsTitle')}</Text>
                <View style={styles.reviews}>
                  {profile.reviews.map((review) => (
                    <ReviewCard
                      key={review.id}
                      body={review.comment}
                      author={review.reviewerName}
                      timeAgo={formatHeTimeAgo(review.createdAt, locale)}
                    />
                  ))}
                </View>

                <Pressable
                  onPress={() =>
                    navigation.navigate('AddRecommendation', {
                      jewelerId: route.params.jewelerId,
                      jewelerName: profile.businessName,
                    })
                  }
                  style={({ pressed }) => pressed && styles.pressed}
                  accessibilityRole="button"
                >
                  <View style={styles.addReviewBtn}>
                    <Text style={styles.addReviewLabel}>{t('jewelerAddReview')}</Text>
                  </View>
                </Pressable>
              </View>

              {isDesigner ? (
                <Pressable
                  onPress={onRequestQuote}
                  style={({ pressed }) => [styles.ctaPressable, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <View style={styles.cta}>
                    <Text style={styles.ctaLabel}>{t('jewelerRequestQuote')}</Text>
                  </View>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <QuoteItemSheet
        visible={sheetOpen}
        title={t('quoteItemSheetTitle')}
        options={quoteOptions}
        onSelect={(option) => void onSelectItem(option)}
        onRequestClose={() => setSheetOpen(false)}
      />

      <QuoteRequestSuccessModal
        visible={successOpen}
        title={t('quoteRequestSuccessTitle')}
        message={t('quoteRequestSuccessMessage')}
        ctaLabel={t('quoteRequestSuccessCta')}
        onCta={() => {
          setSuccessOpen(false)
          navigation.navigate('AtelierList')
        }}
        onRequestClose={() => setSuccessOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF3FA' },
  flex: { flex: 1 },
  content: { alignItems: 'stretch', paddingTop: 8, paddingBottom: 32 },
  column: { width: '100%', paddingHorizontal: 16, gap: 24 },
  name: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aboutCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  aboutAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 3,
    backgroundColor: colors.brand,
  },
  aboutText: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  section: { width: '100%', gap: 12 },
  sectionTitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  galleryContent: { flexDirection: 'row', gap: 12, paddingRight: 0 },
  reviews: { width: '100%', gap: 12 },
  pressed: { opacity: 0.9 },
  addReviewBtn: {
    alignSelf: 'flex-end',
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addReviewLabel: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.brand,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  ctaPressable: { width: '100%', marginTop: 8 },
  cta: {
    width: '100%',
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    color: colors.textInverse,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
