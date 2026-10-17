import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { GalleryCard } from '@/src/components/home/GalleryCard'
import { HeroDesignCard } from '@/src/components/home/HeroDesignCard'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { UpdateRow } from '@/src/components/home/UpdateRow'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { TrialExpiredModal } from '@/src/components/ui/TrialExpiredModal'
import { getMySubscription } from '@/src/api/subscriptions'
import { getHomeSummary } from '@/src/api/home'
import { listGallery } from '@/src/api/gallery'
import { markNotificationRead } from '@/src/api/notifications'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import {
  cachedHomeSummary,
  homeCacheKey,
  homeUpdateRows,
  rememberHomeSummary,
  type HomeUpdateRow,
} from '@/src/lib/homeUpdates'
import { lastTrialReminderAt, rememberTrialReminder, shouldShowTrialEnding } from '@/src/lib/trialReminder'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { DesignerTabParamList, HomeStackParamList } from '@/src/navigation/types'

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>
type TabNav = BottomTabNavigationProp<DesignerTabParamList>

/**
 * Figma: עמוד הבית - מעצב (29:1878)
 * Frame 2147225488 — 329pt column, gap 32, bg #EFF5FC
 *
 * Recent updates are the real notifications only (an empty or error state otherwise). The last
 * summary of this user and role is kept in memory: coming back shows it at once and it refreshes
 * in the background.
 */
export function DesignerHomeScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<HomeNav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const activeRole = useAppSelector((s) => s.auth.user?.activeRole)
  const [trialModalVisible, setTrialModalVisible] = useState(false)

  const cacheKey = homeCacheKey(userId, activeRole)
  const subQuery = useAsyncData((signal) => getMySubscription(signal), { deps: [accessToken] })
  const homeQuery = useAsyncData((signal) => getHomeSummary(signal), { deps: [accessToken] })
  const galleryQuery = useAsyncData((signal) => listGallery(signal), { deps: [] })

  useEffect(() => {
    if (homeQuery.data) rememberHomeSummary(cacheKey, homeQuery.data)
  }, [cacheKey, homeQuery.data])

  // Coming back to the tab refreshes in the background; the first focus is the initial load.
  const focusedOnce = useRef(false)
  const refreshHome = homeQuery.refresh
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refreshHome()
      focusedOnce.current = true
    }, [refreshHome]),
  )

  // "Your trial is ending": a trial that ends within three days, at most once a day.
  const subscription = subQuery.data
  useEffect(() => {
    if (!userId || !subscription) return
    let cancelled = false
    const check = async () => {
      const now = new Date()
      const lastShownAt = await lastTrialReminderAt(userId)
      if (cancelled || !shouldShowTrialEnding(subscription, now, lastShownAt)) return
      await rememberTrialReminder(userId, now)
      if (!cancelled) setTrialModalVisible(true)
    }
    check().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [subscription, userId])

  const summary = homeQuery.data ?? cachedHomeSummary(cacheKey)
  const updates = homeUpdateRows(summary?.recentNotifications, locale)
  const galleryDesignId = galleryQuery.data?.[0]?.designId ?? galleryQuery.data?.[0]?.design?.id

  const openUpdate = (update: HomeUpdateRow) => {
    markNotificationRead(update.id).catch(() => undefined)
    const target = update.target
    if (target.kind === 'quote') {
      tabNavigation.navigate('Chats', {
        screen: 'QuoteDetails',
        initial: false,
        params: { quoteId: target.quoteId, chatId: target.chatId },
      })
      return
    }
    if (target.kind === 'chat') {
      tabNavigation.navigate('Chats', { screen: 'ChatThread', initial: false, params: { chatId: target.chatId } })
      return
    }
    tabNavigation.navigate('Chats')
  }

  return (
    <View style={styles.root}>
      <TrialExpiredModal
        visible={trialModalVisible}
        title={t('trialExpiredTitle')}
        message={t('trialExpiredMessage')}
        primaryLabel={t('trialExpiredCta')}
        onRequestClose={() => setTrialModalVisible(false)}
        onPrimary={() => {
          setTrialModalVisible(false)
          tabNavigation.navigate('Profile', { screen: 'Pricing', initial: false })
        }}
      />
      <HomeHeader />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <HeroDesignCard onPress={() => navigation.navigate('CategorySelect')} />
          <GalleryCard
            onPress={
              galleryDesignId
                ? () =>
                    tabNavigation.navigate('Atelier', {
                      screen: 'DesignPreview',
                      initial: false,
                      params: { designId: galleryDesignId },
                    })
                : undefined
            }
          />
          <View style={styles.updates}>
            <Text style={styles.updatesTitle}>{t('recentUpdates')}</Text>
            {summary ? (
              updates.length > 0 ? (
                updates.map((update, index) => (
                  <UpdateRow
                    key={update.id}
                    title={update.title}
                    subtitle={update.subtitle}
                    showDivider={index < updates.length - 1}
                    onPress={() => openUpdate(update)}
                  />
                ))
              ) : (
                <Text style={styles.empty}>{t('dzHomeNoUpdates')}</Text>
              )
            ) : homeQuery.error && !homeQuery.loading ? (
              <ErrorState
                title={t('dzHomeUpdatesError')}
                message={t('commonLoadingErrorMessage')}
                retryLabel={t('commonRetry')}
                onRetry={homeQuery.retry}
              />
            ) : (
              <ActivityIndicator style={styles.loading} color={colors.brand} />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EFF5FC',
  },
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 64,
  },
  column: {
    width: '100%',
    maxWidth: 329,
    gap: 32,
  },
  updates: {
    width: '100%',
    paddingBottom: 32,
  },
  updatesTitle: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 22,
    letterSpacing: -0.2,
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  empty: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 8,
  },
  loading: {
    paddingVertical: 16,
  },
})
