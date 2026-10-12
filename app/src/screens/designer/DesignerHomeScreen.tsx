import { useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { GalleryCard } from '@/src/components/home/GalleryCard'
import { HeroDesignCard } from '@/src/components/home/HeroDesignCard'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { UpdateRow } from '@/src/components/home/UpdateRow'
import { TrialExpiredModal } from '@/src/components/ui/TrialExpiredModal'
import { getMySubscription } from '@/src/api/subscriptions'
import { getHomeSummary } from '@/src/api/home'
import { listGallery } from '@/src/api/gallery'
import { markNotificationRead } from '@/src/api/notifications'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { formatChatTime } from '@/src/lib/chatTime'
import { useTranslation } from '@/src/i18n'
import type { DesignerTabParamList, HomeStackParamList } from '@/src/navigation/types'

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>
type TabNav = BottomTabNavigationProp<DesignerTabParamList>

/**
 * Figma: עמוד הבית - מעצב (29:1878)
 * Frame 2147225488 — 329pt column, gap 32, bg #EFF5FC
 */
export function DesignerHomeScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<HomeNav>()
  const tabNavigation = navigation.getParent<TabNav>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [trialModalVisible, setTrialModalVisible] = useState(false)

  const subQuery = useAsyncData((signal) => getMySubscription(signal), { deps: [accessToken] })
  const homeQuery = useAsyncData((signal) => getHomeSummary(signal), { deps: [accessToken] })
  const galleryQuery = useAsyncData((signal) => listGallery(signal), { deps: [] })

  const subscription = subQuery.data
  const hasActiveSubscription =
    !subscription || ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(subscription.status)

  const notifications = homeQuery.data?.recentNotifications ?? []
  const latestDesign = homeQuery.data?.recentDesigns?.[0]
  const galleryDesignId = galleryQuery.data?.[0]?.designId ?? galleryQuery.data?.[0]?.design?.id

  const openNotification = (id: string, conversationId?: string) => {
    void markNotificationRead(id).catch(() => undefined)
    if (conversationId) {
      tabNavigation.navigate('Chats', {
        screen: 'ChatThread',
        params: { chatId: conversationId },
      })
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
          tabNavigation.navigate('Profile', { screen: 'Pricing' })
        }}
      />
      <HomeHeader />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <HeroDesignCard
            onPress={() => {
              if (!hasActiveSubscription) {
                setTrialModalVisible(true)
                return
              }
              navigation.navigate('CategorySelect')
            }}
          />
          <GalleryCard
            onPress={
              galleryDesignId
                ? () =>
                    tabNavigation.navigate('Atelier', {
                      screen: 'DesignPreview',
                      params: { designId: galleryDesignId },
                    })
                : undefined
            }
          />
          <View style={styles.updates}>
            <Text style={styles.updatesTitle}>{t('recentUpdates')}</Text>
            {notifications.length > 0 ? (
              notifications.slice(0, 3).map((item, index) => (
                <UpdateRow
                  key={item.id}
                  title={item.title}
                  subtitle={formatChatTime(item.createdAt, locale) || item.body}
                  showDivider={index < Math.min(notifications.length, 3) - 1}
                  onPress={() =>
                    openNotification(
                      item.id,
                      item.payload && typeof item.payload === 'object'
                        ? item.payload.conversationId
                        : undefined,
                    )
                  }
                />
              ))
            ) : (
              <>
                <UpdateRow
                  title={t('updateNewMessage')}
                  subtitle={t('updateMinutesAgo')}
                  onPress={() => tabNavigation.navigate('Chats')}
                />
                <UpdateRow
                  title={t('updateNewQuote')}
                  subtitle={latestDesign?.title || t('updateQuoteDate')}
                  onPress={() => tabNavigation.navigate('MyDesigns')}
                />
              </>
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
})
