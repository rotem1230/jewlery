import { useCallback, useEffect, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { Search } from 'lucide-react-native'
import { FilterChip } from '@/src/components/designs/FilterChip'
import { AtelierDesignCard } from '@/src/components/atelier/AtelierDesignCard'
import { JewelerCard } from '@/src/components/atelier/JewelerCard'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { listAtelierBanners, listAtelierDesigns, listAtelierGeoSearch, listAtelierJewelers } from '@/src/api/atelier'
import { listRegions } from '@/src/api/masterData'
import { imageFromUpload } from '@/src/lib/format'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, radii } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { AtelierStackParamList, JewelerTabParamList } from '@/src/navigation/types'
import jewelerAvatar from '../../../assets/images/designs/jeweler-avatar-1.png'
import heroRing from '../../../assets/images/home/hero-ring.png'

type TabNav = BottomTabNavigationProp<JewelerTabParamList>
type AtelierTab = 'jewelers' | 'designs'

/** Search centre for "near me" until the device location is used. */
const TEL_AVIV = { lat: 32.0853, lng: 34.7818 }

export function AtelierScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<AtelierStackParamList>>()
  const myUserId = useAppSelector((s) => s.auth.user?.id)
  const isJeweler = useAppSelector((s) => s.auth.user?.activeRole === 'JEWELER')
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [tab, setTab] = useState<AtelierTab>(isJeweler ? 'designs' : 'jewelers')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [regionId, setRegionId] = useState<string | undefined>(undefined)
  const [nearby, setNearby] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => clearTimeout(timer)
  }, [query])

  const regionsQuery = useAsyncData((signal) => listRegions(signal), { deps: [] })
  const regions = regionsQuery.data ?? []

  const jewelersLoad = useCallback(
    (signal: AbortSignal) =>
      nearby
        ? listAtelierGeoSearch({ lat: TEL_AVIV.lat, lng: TEL_AVIV.lng, radiusKm: 25, page: 1 }, signal)
        : listAtelierJewelers(
            { q: debouncedQuery || undefined, regionId, page: 1 },
            signal,
          ),
    [debouncedQuery, regionId, nearby],
  )
  const designsLoad = useCallback(
    (signal: AbortSignal) =>
      listAtelierDesigns({ q: debouncedQuery || undefined, regionId, page: 1 }, signal),
    [debouncedQuery, regionId],
  )

  const jewelersQuery = useAsyncData(jewelersLoad, { deps: [accessToken, debouncedQuery, regionId, nearby] })
  const designsQuery = useAsyncData(designsLoad, { deps: [accessToken, debouncedQuery, regionId] })
  const bannersQuery = useAsyncData((signal) => listAtelierBanners(signal), { deps: [] })

  const isDesigns = tab === 'designs'
  const activeQuery = isDesigns ? designsQuery : jewelersQuery
  const jewelers = jewelersQuery.data?.items ?? []
  const designs = designsQuery.data?.items ?? []
  const bannerHeadline = (() => {
    const banner = bannersQuery.data?.[0]
    const headline = banner?.meta?.headline
    return typeof headline === 'string' && headline.trim() ? headline.trim() : null
  })()

  return (
    <View style={styles.root}>
      <HomeHeader backdropColor="#EDF3FA" showLogo={false} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={activeQuery.refreshing} onRefresh={activeQuery.refresh} />
        }
      >
        <View style={styles.column}>
          <View style={styles.segmentShell}>
            <View style={styles.segmentRow}>
              <Pressable
                onPress={() => setTab('jewelers')}
                style={({ pressed }) => pressed && styles.pressed}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === 'jewelers' }}
              >
                <View
                  style={[
                    styles.segmentBtn,
                    tab === 'jewelers' ? styles.segmentSelected : styles.segmentIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      tab === 'jewelers' ? styles.segmentLabelOn : styles.segmentLabelOff,
                    ]}
                  >
                    {t('atelierTabJewelers')}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setTab('designs')}
                style={({ pressed }) => pressed && styles.pressed}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === 'designs' }}
              >
                <View
                  style={[
                    styles.segmentBtn,
                    tab === 'designs' ? styles.segmentSelected : styles.segmentIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      tab === 'designs' ? styles.segmentLabelOn : styles.segmentLabelOff,
                    ]}
                  >
                    {t('atelierTabDesigns')}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.discovery}>
            {bannerHeadline ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{bannerHeadline}</Text>
              </View>
            ) : null}
            <View style={styles.headingBlock}>
              <Text style={[styles.title, isDesigns && styles.titleItalic]}>{t('atelierTitle')}</Text>
              <Text style={styles.subtitle}>
                {isDesigns ? t('atelierDesignsSubtitle') : t('atelierSubtitle')}
              </Text>
            </View>

            <View style={styles.searchShadow}>
              <View style={styles.search}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={
                    isDesigns ? t('atelierDesignsSearchPlaceholder') : t('atelierSearchPlaceholder')
                  }
                  placeholderTextColor="#767686"
                  style={styles.searchInput}
                  textAlign="right"
                  returnKeyType="search"
                />
                <Search size={20} color="#767686" strokeWidth={1.5} />
              </View>
            </View>

            <View style={styles.filtersBlock}>
              <Text style={styles.locationLabel}>{t('atelierLocationLabel')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                <FilterChip
                  label={t('atelierFilterAll')}
                  selected={!regionId && !nearby}
                  onPress={() => {
                    setNearby(false)
                    setRegionId(undefined)
                  }}
                />
                <FilterChip
                  label={t('atelierFilterNearby')}
                  selected={nearby}
                  onPress={() => {
                    setNearby(true)
                    setRegionId(undefined)
                  }}
                />
                {regions.map((region) => (
                  <FilterChip
                    key={region.id}
                    label={locale === 'en' && region.labelEn ? region.labelEn : region.labelHe}
                    selected={!nearby && regionId === region.id}
                    onPress={() => {
                      setNearby(false)
                      setRegionId(region.id)
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          {activeQuery.error && !activeQuery.loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={activeQuery.retry}
            />
          ) : isDesigns ? (
            <View style={styles.designCards}>
              {designs.length === 0 && !designsQuery.loading ? (
                <Text style={styles.empty}>{t('atelierEmpty')}</Text>
              ) : (
                designs.map((item) => (
                  <AtelierDesignCard
                    key={item.id}
                    title={item.title || t('atelierDesign1Title')}
                    metal={item.itemType?.labelHe ?? ''}
                    publishedLabel={`${t('atelierPublishedOn')} ${
                      item.publishedAt
                        ? new Date(item.publishedAt).toLocaleDateString(
                            locale === 'he' ? 'he-IL' : 'en-GB',
                          )
                        : ''
                    }`}
                    ctaLabel={t('atelierViewDesignDetails')}
                    image={imageFromUpload(item.thumbnailUploadId, heroRing)}
                    sponsored={item.sponsored === true}
                    sponsoredLabel={t('atelierSponsored')}
                    onPress={() => navigation.navigate('DesignPreview', { designId: item.id })}
                  />
                ))
              )}
            </View>
          ) : (
            <View style={styles.cards}>
              {jewelers.length === 0 && !jewelersQuery.loading ? (
                <Text style={styles.empty}>{t('atelierEmpty')}</Text>
              ) : (
                jewelers.map((item) => {
                  const own = item.userId === myUserId
                  const works = item.portfolio.map((p) => imageFromUpload(p.uploadId, heroRing))
                  return (
                    <JewelerCard
                      key={item.id}
                      name={item.businessName}
                      city={item.region?.labelHe ?? ''}
                      rating={String(Number(item.ratingAvg).toFixed(1))}
                      reviewCount={item.reviewCount}
                      reviewsLabel={t('atelierReviewsLabel')}
                      ctaLabel={t('atelierViewProfile')}
                      ctaVariant={own ? 'ownProfile' : 'viewProfile'}
                      worksTitle={t('atelierSelectedWorks')}
                      bio={item.bio ?? ''}
                      avatar={imageFromUpload(item.logoUpload?.id, jewelerAvatar)}
                      works={works}
                      moreCount={item.portfolio.length > 4 ? `+${item.portfolio.length - 4}` : undefined}
                      matchScore={item.matchScore}
                      matchLabel={t('atelierMatchScore')}
                      editLabel={own ? t('atelierEditMyProfile') : undefined}
                      onPressEdit={
                        own
                          ? () =>
                              navigation
                                .getParent<TabNav>()
                                ?.navigate('Profile', { screen: 'BusinessProfileView' })
                          : undefined
                      }
                      onPressCta={() => navigation.navigate('JewelerProfile', { jewelerId: item.id })}
                    />
                  )
                })
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF3FA' },
  flex: { flex: 1 },
  content: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  column: {
    width: '100%',
    maxWidth: 343,
    alignItems: 'center',
    gap: 40,
  },
  pressed: { opacity: 0.9 },
  segmentShell: {
    width: 210,
    height: 42,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#C6C5D7',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtn: {
    minWidth: 98,
    height: 32,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.brand },
  segmentIdle: { backgroundColor: colors.surface },
  segmentLabel: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  segmentLabelOn: { color: colors.textInverse },
  segmentLabelOff: { color: '#454654' },
  discovery: { width: '100%', maxWidth: 327, alignItems: 'center', gap: 24 },
  headingBlock: { width: '100%', gap: 8, alignItems: 'center' },
  banner: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerText: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 32,
    fontWeight: '500',
    lineHeight: 35,
    letterSpacing: -0.32,
    color: colors.ink,
    textAlign: 'center',
  },
  titleItalic: { fontStyle: 'italic' },
  subtitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: '#454654',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  searchShadow: {
    width: '100%',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    shadowColor: '#C7C7C7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  search: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.ink,
    paddingVertical: 0,
    writingDirection: 'rtl',
  },
  filtersBlock: { width: '100%', gap: 12 },
  locationLabel: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  filters: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minWidth: '100%',
    justifyContent: 'flex-start',
  },
  cards: { width: '100%', gap: 32 },
  designCards: { width: '100%', gap: 12 },
  empty: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingVertical: 16,
  },
})
