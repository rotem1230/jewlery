import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { DesignListCard, type DesignBadgeTone } from '@/src/components/designs/DesignListCard'
import { FilterChip } from '@/src/components/designs/FilterChip'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { listDesigns } from '@/src/api/designs'
import { designPicture } from '@/src/lib/designPicture'
import { completedByLabel, designDisplayTitle } from '@/src/lib/designActions'
import {
  appendDesignPage,
  canLoadMoreDesigns,
  firstDesignPage,
  isNearListEnd,
  type DesignPages,
} from '@/src/lib/designPages'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, spacing } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import type { DesignStatus as ApiStatus } from '@/src/types/api'
import type { DesignerTabParamList, MyDesignsStackParamList } from '@/src/navigation/types'

type DesignStatus = 'draft' | 'published' | 'completed' | 'archived'
type FilterId = 'all' | DesignStatus
type Nav = NativeStackNavigationProp<MyDesignsStackParamList, 'DesignsList'>
type TabNav = BottomTabNavigationProp<DesignerTabParamList>

const STATUS_LABEL: Record<DesignStatus, TranslationKey> = {
  draft: 'statusDraft',
  published: 'statusPublished',
  completed: 'statusCompleted',
  archived: 'statusArchived',
}

const STATUS_TONE: Record<DesignStatus, DesignBadgeTone> = {
  draft: 'muted',
  published: 'ink',
  completed: 'success',
  archived: 'outline',
}

const FILTER_TO_API: Record<Exclude<FilterId, 'all'>, ApiStatus> = {
  draft: 'DRAFT',
  published: 'PUBLISHED',
  completed: 'COMPLETED',
  archived: 'ARCHIVED',
}

function uiStatus(status: string): DesignStatus {
  const map: Record<string, DesignStatus> = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
  }
  return map[status] ?? 'draft'
}

export function MyDesignsScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [filter, setFilter] = useState<FilterId>('all')
  const [pages, setPages] = useState<DesignPages | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)
  const loadingMoreRef = useRef(false)

  const statusFor = (id: FilterId) => (id === 'all' ? undefined : FILTER_TO_API[id])

  // The first page of the tab; each answer carries the tab it belongs to, so a late answer of the
  // previous tab is never shown under the new one.
  const load = useCallback(
    async (signal: AbortSignal) => {
      const status = filter === 'all' ? undefined : FILTER_TO_API[filter]
      return { filter, response: await listDesigns({ status, page: 1 }, signal) }
    },
    [filter],
  )
  const { data, loading, refreshing, error, refresh, retry } = useAsyncData(load, {
    deps: [accessToken, filter],
  })

  // Coming back from a design (deleted, archived, published there): the list shows it as it is now.
  // Through a ref: a tab change gives a new refresh, which must not reload the list again.
  const focusedOnce = useRef(false)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true
        return
      }
      void refreshRef.current()
    }, []),
  )

  useEffect(() => {
    if (!data) return
    setPages(firstDesignPage(data.filter, data.response))
    setLoadMoreFailed(false)
  }, [data])

  const visible = pages && pages.key === filter ? pages : null
  const counts = pages?.tabCounts ?? { all: 0, drafts: 0, published: 0, completed: 0, archive: 0 }
  const items = visible?.items ?? []

  const loadMore = async () => {
    if (!visible || !canLoadMoreDesigns(visible) || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreFailed(false)
    try {
      const key = visible.key as FilterId
      const response = await listDesigns({ status: statusFor(key), page: visible.page + 1 })
      setPages((current) => (current ? appendDesignPage(current, key, response) : current))
    } catch {
      setLoadMoreFailed(true)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!loadMoreFailed && isNearListEnd(event.nativeEvent)) loadMore()
  }

  const filters: Array<{ id: FilterId; labelKey: TranslationKey; count?: number }> = [
    { id: 'all', labelKey: 'filterAll', count: counts.all },
    { id: 'draft', labelKey: 'filterDrafts', count: counts.drafts },
    { id: 'published', labelKey: 'filterPublished', count: counts.published },
    { id: 'completed', labelKey: 'filterCompleted', count: counts.completed },
    { id: 'archived', labelKey: 'filterArchive', count: counts.archive },
  ]

  return (
    <View style={styles.root}>
      <HomeHeader backdropColor={colors.authBg} />

      <View style={styles.body}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={200}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <View style={styles.column}>
            <View style={styles.heading}>
              <Text style={styles.title}>{t('myDesigns')}</Text>
              <Text style={styles.subtitle}>{t('myDesignsSubtitle')}</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {filters.map((item) => (
                <FilterChip
                  key={item.id}
                  label={t(item.labelKey)}
                  count={item.count}
                  selected={filter === item.id}
                  onPress={() => setFilter(item.id)}
                />
              ))}
            </ScrollView>

            {error && !visible && !loading ? (
              <ErrorState
                title={t('commonLoadingErrorTitle')}
                message={t('commonLoadingErrorMessage')}
                retryLabel={t('commonRetry')}
                onRetry={retry}
              />
            ) : !visible ? (
              <ActivityIndicator style={styles.loading} color={colors.brand} />
            ) : items.length === 0 ? (
              <Text style={styles.empty}>{t('designsEmpty')}</Text>
            ) : (
              <View style={styles.list}>
                {items.map((item) => {
                  const status = uiStatus(item.status)
                  const picture = designPicture(item)
                  return (
                    <DesignListCard
                      key={item.id}
                      title={designDisplayTitle(item, locale)}
                      subtitle={item.itemType?.labelHe ?? ''}
                      detail={completedByLabel(item, locale) ?? undefined}
                      statusLabel={t(STATUS_LABEL[status])}
                      statusTone={STATUS_TONE[status]}
                      accentLabel={
                        item.quoteCount > 0
                          ? t('quotesCount').replace('{{count}}', String(item.quoteCount))
                          : undefined
                      }
                      image={picture.source}
                      imageResizeMode={picture.resizeMode}
                      onPress={() => navigation.navigate('DesignDetails', { designId: item.id })}
                    />
                  )
                })}
                {loadingMore ? <ActivityIndicator style={styles.loading} color={colors.brand} /> : null}
                {loadMoreFailed ? (
                  <Pressable accessibilityRole="button" onPress={loadMore} style={styles.loadMoreRetry}>
                    <Text style={styles.empty}>{t('dzLoadMoreFailed')}</Text>
                    <Text style={styles.retryLabel}>{t('commonRetry')}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <BrandButton
            label={t('startNewDesign')}
            variant="primary"
            flex={false}
            onPress={() => tabNavigation?.navigate('Home', { screen: 'CategorySelect', initial: false })}
          />
        </View>
      </View>
    </View>
  )
}

const androidFont = Platform.OS === 'android' ? { includeFontPadding: false as const } : null

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.authBg,
  },
  body: {
    flex: 1,
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 327,
    gap: spacing.lg,
  },
  heading: {
    width: '100%',
    gap: 10,
    alignItems: 'flex-end',
  },
  title: {
    ...androidFont,
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
    letterSpacing: -0.24,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    ...androidFont,
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.slate,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  filters: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: '100%',
    justifyContent: 'flex-start',
  },
  list: {
    width: '100%',
    gap: spacing.lg,
  },
  empty: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingVertical: 24,
  },
  loading: {
    paddingVertical: 24,
  },
  loadMoreRetry: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 16,
  },
  retryLabel: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  footer: {
    width: '100%',
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.xs,
  },
})
