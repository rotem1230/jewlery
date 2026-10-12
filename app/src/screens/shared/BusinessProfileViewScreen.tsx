import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { BusinessProfileSummary } from '@/src/components/jeweler/BusinessProfileSummary'
import { BusinessProfileSkeleton } from '@/src/components/jeweler/BusinessProfileSkeleton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { useMyBusinessProfile } from '@/src/hooks/useMyBusinessProfile'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { ProfileStackParamList } from '@/src/navigation/types'

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'BusinessProfileView'>

/**
 * Figma "פרופיל צורף" (own view) — published business profile with an edit link.
 * Page 1 of the backend integration: profile + portfolio + reviews come from
 * `GET /jeweler-profiles/me` (see `useMyBusinessProfile`).
 */
export function BusinessProfileViewScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const { profile, loading, refreshing, error, refresh, retry } = useMyBusinessProfile()

  const showSkeleton = loading && !profile
  const showError = !loading && !profile && error
  const errorMessage =
    __DEV__ && error
      ? `${t('commonLoadingErrorMessage')} (${error.message})`
      : t('commonLoadingErrorMessage')

  return (
    <View style={styles.root}>
      <HomeHeader backdropColor="#EDF3FA" showLogo />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.column}>
          <TouchableOpacity
            onPress={() => navigation.navigate('ProfileHome')}
            accessibilityRole="button"
          >
            <Text style={styles.editLink}>{t('profileAccountLink')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              navigation.navigate('BusinessProfileForm', { mode: profile ? 'edit' : 'create' })
            }
            accessibilityRole="button"
          >
            <Text style={styles.editLink}>
              {profile ? t('businessProfileEditLink') : t('businessProfileBuildTitle')}
            </Text>
          </TouchableOpacity>

          {showSkeleton ? (
            <BusinessProfileSkeleton />
          ) : showError ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={errorMessage}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : profile ? (
            <BusinessProfileSummary
              name={profile.name}
              about={profile.about}
              galleryTitle={t('businessProfileGalleryLabel')}
              gallery={profile.gallery}
              reviewsTitle={t('businessProfileReviewsLabel')}
              reviews={profile.reviews}
              reviewsEmptyLabel={t('businessProfileReviewsEmpty')}
            />
          ) : (
            <ErrorState
              title={t('businessProfileBuildTitle')}
              message={t('commonEmpty')}
              retryLabel={t('businessProfileBuildTitle')}
              onRetry={() => navigation.navigate('BusinessProfileForm', { mode: 'create' })}
            />
          )}
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
  editLink: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'left',
    writingDirection: 'rtl',
  },
})
