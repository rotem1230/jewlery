import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { FilterChip } from '@/src/components/designs/FilterChip'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { getMyOrders } from '@/src/api/jewelerProfiles'
import { getHomeSummary } from '@/src/api/home'
import { parseApiError } from '@/src/lib/api'
import { imageFromUpload } from '@/src/lib/format'
import { ORDER_TABS, boardFromPages, orderBadge, type BadgeTone, type OrdersTab } from '@/src/lib/jewelerOrders'
import { formatHeTimeAgo } from '@/src/hooks/useMyBusinessProfile'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, radii } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import type { DesignRequest, Paginated } from '@/src/types/api'
import type { MyOrdersStackParamList } from '@/src/navigation/types'
import jewelerAvatar from '../../../assets/images/designs/jeweler-avatar-1.png'
import heroRing from '../../../assets/images/home/hero-ring.png'

type Nav = NativeStackNavigationProp<MyOrdersStackParamList, 'OrdersList'>
type OrdersPage = Paginated<DesignRequest>

function greetingKey(): TranslationKey {
  const hour = new Date().getHours()
  if (hour < 12) return 'jewelerGreetingMorning'
  if (hour < 18) return 'jewelerGreetingAfternoon'
  return 'jewelerGreetingEvening'
}

const BADGE_STYLES: Record<BadgeTone, { box: object; text: object }> = {
  new: { box: { backgroundColor: colors.brand }, text: { color: colors.textInverse } },
  active: {
    box: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderSubtle },
    text: { color: colors.textSecondary },
  },
  done: { box: { backgroundColor: '#ECFDF3' }, text: { color: '#067647' } },
  closed: { box: { backgroundColor: '#F2F4F7' }, text: { color: colors.textSecondary } },
}

/**
 * Jeweler home: the orders board (PRD 5.11). Tabs and badges follow this jeweler's own status
 * (`myStatus`), filtered on the server; the counters come from `/home/summary` only.
 */
export function MyOrdersScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const user = useAppSelector((s) => s.auth.user)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [tab, setTab] = useState<OrdersTab>('all')
  // Pages after the first, kept only while they belong to the first page they continue.
  const [more, setMore] = useState<{ base: unknown; pages: OrdersPage[] }>({ base: null, pages: [] })
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(
    async (signal: AbortSignal) => ({ tab, page: await getMyOrders({ tab, page: 1 }, signal) }),
    [tab],
  )
  const { data, loading, refreshing, error, refresh, retry } = useAsyncData(load, {
    deps: [accessToken, tab],
  })
  const {
    data: home,
    loading: homeLoading,
    refreshing: homeRefreshing,
    refresh: refreshHome,
  } = useAsyncData((signal) => getHomeSummary(signal), { deps: [accessToken] })

  // Coming back from an order (declined, quoted, withdrawn): the board and counters are reloaded.
  const firstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      refresh()
      refreshHome()
    }, [refresh, refreshHome]),
  )

  const isDemo = user?.id === 'demo'
  const name = isDemo
    ? t('profileDemoName')
    : (home?.greeting?.name ?? user?.firstName ?? t('jeweler'))

  // A previous tab's page is not shown while the selected tab loads.
  const firstPage = data?.tab === tab ? data.page : null
  const board = useMemo(
    () => boardFromPages(firstPage ? [firstPage, ...(more.base === firstPage ? more.pages : [])] : []),
    [firstPage, more],
  )

  const loadMore = async () => {
    if (!firstPage || !board.hasMore || loadingMore) return
    const base = firstPage
    setLoadingMore(true)
    try {
      const next = await getMyOrders({ tab, page: board.nextPage })
      setMore((prev) => ({ base, pages: [...(prev.base === base ? prev.pages : []), next] }))
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const onRefresh = () => {
    refresh()
    refreshHome()
  }

  // Server counters only: a dash while loading or when they could not be loaded.
  const counter = (value: number | undefined) => (homeLoading || value == null ? '—' : value)

  const renderOrder = (order: DesignRequest) => {
    const badge = orderBadge(order.myStatus)
    const itemType = order.design?.itemType
    const typeLabel = (locale === 'en' ? itemType?.labelEn : itemType?.labelHe) ?? itemType?.labelHe ?? ''
    return (
      <TouchableOpacity
        key={order.id}
        style={styles.orderCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('OrderDetails', { orderId: order.id })}
      >
        <Image
          source={imageFromUpload(order.design?.thumbnailUploadId, heroRing)}
          style={styles.orderImage}
          resizeMode="cover"
        />
        <View style={styles.orderInfo}>
          <Text style={styles.orderTitle}>
            {order.design?.title || typeLabel || t('jwUntitledDesign')}
          </Text>
          {typeLabel ? <Text style={styles.orderMaterial}>{typeLabel}</Text> : null}
          <Text style={styles.orderTime}>{formatHeTimeAgo(order.createdAt, locale)}</Text>
          {badge ? (
            <View style={[styles.badge, BADGE_STYLES[badge.tone].box]}>
              <Text style={[styles.badgeText, BADGE_STYLES[badge.tone].text]}>{t(badge.labelKey)}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.root}>
      <HomeHeader backdropColor="#EDF3FA" showLogo />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing || homeRefreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.column}>
          <View style={styles.greetingCard}>
            <View style={styles.greetingRow}>
              <Image source={jewelerAvatar} style={styles.avatar} />
              <Text style={styles.greetingText}>
                {t(greetingKey())}, {name}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>{t('jewelerStatInProgress')}</Text>
                <Text style={styles.statValue}>{counter(home?.inProgress)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>{t('jewelerStatNewRequests')}</Text>
                <Text style={styles.statValue}>{counter(home?.newRequests)}</Text>
              </View>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {ORDER_TABS.map((item) => (
              <FilterChip
                key={item.id}
                label={t(item.labelKey)}
                // The server counts the selected tab only; other tabs show no number rather than a guess.
                count={item.id === tab && firstPage ? board.total : undefined}
                selected={tab === item.id}
                onPress={() => setTab(item.id)}
              />
            ))}
          </ScrollView>

          {error && board.items.length === 0 && !loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : board.items.length === 0 && firstPage ? (
            <Text style={styles.empty}>{t('ordersEmpty')}</Text>
          ) : (
            <View style={styles.orders}>
              {board.items.map(renderOrder)}
              {board.hasMore ? (
                <BrandButton
                  label={t('jwLoadMore')}
                  variant="outline"
                  flex={false}
                  disabled={loadingMore}
                  onPress={() => loadMore()}
                />
              ) : null}
            </View>
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  column: {
    width: '100%',
    maxWidth: 343,
    gap: 20,
  },
  greetingCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
    gap: 20,
  },
  greetingRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  greetingText: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minHeight: 76,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 4,
  },
  statLabel: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    color: colors.textInverse,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statValue: {
    fontFamily: 'Heebo',
    fontSize: 28,
    fontWeight: '700',
    color: colors.textInverse,
    textAlign: 'right',
  },
  filters: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minWidth: '100%',
  },
  orders: {
    width: '100%',
    gap: 16,
  },
  empty: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingVertical: 16,
  },
  orderCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 12,
    gap: 12,
  },
  orderImage: {
    width: 108,
    height: 108,
    borderRadius: radii.md,
  },
  orderInfo: {
    flex: 1,
    paddingVertical: 4,
    gap: 4,
    alignItems: 'flex-end',
  },
  orderTitle: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  orderMaterial: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  orderTime: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  badge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  badgeText: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '500',
  },
})
