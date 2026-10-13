import { useCallback, useMemo, useState } from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { DesignDetailsCard } from '@/src/components/designs/DesignDetailsCard'
import { BrandButton } from '@/src/components/ui/BrandButton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { ChatImageViewer } from '@/src/components/chats/ChatImageViewer'
import { getAtelierDesign } from '@/src/api/atelier'
import { isNotFound, listingExpiry } from '@/src/lib/atelierView'
import { imageFromUpload } from '@/src/lib/format'
import { designSpecRows } from '@/src/lib/jewelerOrders'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { colors, spacing } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { AtelierStackParamList, DesignerTabParamList } from '@/src/navigation/types'
import heroRing from '../../../assets/images/home/hero-ring.png'

type Nav = NativeStackNavigationProp<AtelierStackParamList, 'DesignPreview'>
type Route = RouteProp<AtelierStackParamList, 'DesignPreview'>

/** A listed design, loaded by id (`GET /atelier/designs/:id`); a listing no longer live is a 404. */
export function PublicDesignScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const myUserId = useAppSelector((s) => s.auth.user?.id)
  const isJeweler = useAppSelector((s) => s.auth.user?.activeRole === 'JEWELER')
  const [viewerUri, setViewerUri] = useState<string | null>(null)

  const load = useCallback(
    (signal: AbortSignal) => getAtelierDesign(route.params.designId, signal),
    [route.params.designId],
  )
  const { data: design, loading, error, retry } = useAsyncData(load, {
    deps: [route.params.designId],
  })

  const specs = useMemo(() => designSpecRows(design), [design])
  const expiry = listingExpiry(design?.expiresAt, locale)
  const ownDesign = design?.ownerUserId === myUserId

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('designDetails')} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {isNotFound(error) && !loading ? (
            <ErrorState
              title={t('jwListingUnavailableTitle')}
              message={t('jwListingUnavailableMessage')}
              retryLabel={t('jwBack')}
              onRetry={() => navigation.goBack()}
            />
          ) : error && !design && !loading ? (
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          ) : design ? (
            <>
              <DesignDetailsCard
                sectionTitle={t('designDetailsShort')}
                image={imageFromUpload(design.thumbnailUploadId, heroRing)}
                title={design.title || design.itemType?.labelHe || t('jwUntitledDesign')}
                quote={design.description || ''}
                specs={specs}
                onMaximize={() => {
                  const source = imageFromUpload(design.thumbnailUploadId, heroRing)
                  if (typeof source === 'object' && source && 'uri' in source && source.uri) {
                    setViewerUri(source.uri)
                    return
                  }
                  const resolved = Image.resolveAssetSource(source)
                  if (resolved?.uri) setViewerUri(resolved.uri)
                }}
              />
              {expiry ? (
                <Text style={styles.expiry}>
                  {t(expiry.expired ? 'jwExpiredOn' : 'jwValidUntil').replace('{{date}}', expiry.date)}
                </Text>
              ) : null}
              {isJeweler && !expiry?.expired ? (
                <BrandButton
                  label={t('atelierQuoteThisDesign')}
                  variant="primary"
                  flex={false}
                  onPress={() =>
                    navigation.navigate('SubmitQuote', { designId: design.id })
                  }
                />
              ) : null}
              {ownDesign && !isJeweler ? (
                <BrandButton
                  label={t('editDesign')}
                  variant="outline"
                  flex={false}
                  onPress={() =>
                    navigation
                      .getParent<BottomTabNavigationProp<DesignerTabParamList>>()
                      ?.navigate('MyDesigns', {
                        screen: 'DesignDetails',
                        params: { designId: design.id },
                      })
                  }
                />
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
      <ChatImageViewer imageUri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.homeBg },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  column: { width: '100%', maxWidth: 448, gap: spacing.xl },
  expiry: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
