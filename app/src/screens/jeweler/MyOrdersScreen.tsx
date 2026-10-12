import { useCallback, useMemo, useState } from 'react'
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { FilterChip } from '@/src/components/designs/FilterChip'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { getMyOrders } from '@/src/api/jewelerProfiles'
import { getHomeSummary } from '@/src/api/home'
import { imageFromUpload, displayName } from '@/src/lib/format'
import { formatHeTimeAgo } from '@/src/hooks/useMyBusinessProfile'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, radii } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import type { DesignRequest, DesignRequestStatus } from '@/src/types/api'
import type { MyOrdersStackParamList } from '@/src/navigation/types'
import jewelerAvatar from '../../../assets/images/designs/jeweler-avatar-1.png'
import heroRing from '../../../assets/images/home/hero-ring.png'

type Nav = NativeStackNavigationProp<MyOrdersStackParamList, 'OrdersList'>
type OrderStatus = 'submitted' | 'negotiating' | 'completed'
type FilterId = 'all' | OrderStatus

function greetingKey(): TranslationKey {
  const hour = new Date().getHours()
  if (hour < 12) return 'jewelerGreetingMorning'
  if (hour < 18) return 'jewelerGreetingAfternoon'
  return 'jewelerGreetingEvening'
}

function uiStatus(status: DesignRequestStatus | string): OrderStatus {
  if (status === 'NEGOTIATING') return 'negotiating'
  if (status === 'COMPLETED') return 'completed'
  return 'submitted'
}

export function MyOrdersScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const user = useAppSelector((s) => s.auth.user)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [filter, setFilter] = useState<FilterId>('all')

  const load = useCallback((signal: AbortSignal) => getMyOrders({ tab: 'all' }, signal), [])
  const { data, loading, refreshing, error, refresh, retry } = useAsyncData(load, {
    deps: [accessToken],
  })
  const homeQuery = useAsyncData((signal) => getHomeSummary(signal), { deps: [accessToken] })

  const isDemo = user?.id === 'demo'
  const name = isDemo
    ? t('profileDemoName')
    : (homeQuery.data?.greeting?.name ?? user?.firstName ?? t('jeweler'))
  const orders = data?.items ?? []

  const counts = useMemo(() => {
    const submitted = orders.filter((o) => uiStatus(o.status) === 'submitted').length
    const negotiating = orders.filter((o) => uiStatus(o.status) === 'negotiating').length
    const completed = orders.filter((o) => uiStatus(o.status) === 'completed').length
    return { all: orders.length, submitted, negotiating, completed }
  }, [orders])

  const visibleOrders =
    filter === 'all' ? orders : orders.filter((o) => uiStatus(o.status) === filter)

  const inProgressCount = homeQuery.data?.inProgress ?? counts.submitted + counts.negotiating
  const newRequestsCount = homeQuery.data?.newRequests ?? orders.filter((o) => o.status === 'OPEN').length

  const filters: Array<{ id: FilterId; labelKey: TranslationKey; count: number }> = [
    { id: 'all', labelKey: 'jewelerFilterAll', count: counts.all },
    { id: 'submitted', labelKey: 'jewelerFilterSubmitted', count: counts.submitted },
    { id: 'negotiating', labelKey: 'jewelerFilterNegotiating', count: counts.negotiating },
    { id: 'completed', labelKey: 'jewelerFilterCompleted', count: counts.completed },
  ]

  const renderOrder = (order: DesignRequest) => {
    const status = uiStatus(order.status)
    const isNew = order.status === 'OPEN'
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
          <Text style={styles.orderTitle}>{order.design?.title || t('jewelerOrder1Title')}</Text>
          <Text style={styles.orderMaterial}>{order.design?.itemType?.labelHe ?? ''}</Text>
          <Text style={styles.orderTime}>{formatHeTimeAgo(order.createdAt, locale)}</Text>
          <View style={[styles.badge, isNew ? styles.badgeNew : styles.badgeWaiting]}>
            <Text style={[styles.badgeText, isNew ? styles.badgeTextNew : styles.badgeTextWaiting]}>
              {t(isNew ? 'jewelerBadgeNew' : status === 'completed' ? 'jewelerFilterCompleted' : 'jewelerBadgeWaiting')}
            </Text>
          </View>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
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
                <Text style={styles.statValue}>{loading ? '—' : inProgressCount}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>{t('jewelerStatNewRequests')}</Text>
                <Text style={styles.statValue}>{loading ? '—' : newRequestsCount}</Text>
              </View>
            </View>
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

          {error && orders.length === 0 && !loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : visibleOrders.length === 0 && !loading ? (
            <Text style={styles.empty}>{t('ordersEmpty')}</Text>
          ) : (
            <View style={styles.orders}>{visibleOrders.map(renderOrder)}</View>
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
  badgeNew: {
    backgroundColor: colors.brand,
  },
  badgeWaiting: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  badgeText: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '500',
  },
  badgeTextNew: {
    color: colors.textInverse,
  },
  badgeTextWaiting: {
    color: colors.textSecondary,
  },
})
