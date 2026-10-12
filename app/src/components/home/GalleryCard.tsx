import { useState } from 'react'
import {
  ImageBackground,
  LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import galleryBg from '../../../assets/images/home/gallery-bg.png'
import { radii, shadows } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'

const COLLECTION_URL = 'https://malinovskyjewelry.com/'

type GalleryCardProps = {
  onPress?: () => void
}

/**
 * Figma Section 3 Full Gallery (329×226).
 * Photo left + blue fade right; copy + white CTA bottom-right.
 */
export function GalleryCard({ onPress }: GalleryCardProps) {
  const { t } = useTranslation()
  const [size, setSize] = useState({ width: 0, height: 0 })

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ width, height })
  }

  const openCollection = () => {
    if (onPress) {
      onPress()
      return
    }
    void Linking.openURL(COLLECTION_URL)
  }

  return (
    <View style={styles.shadowWrap}>
      <View style={styles.card}>
        <ImageBackground
          source={galleryBg}
          style={styles.media}
          resizeMode="cover"
          onLayout={onLayout}
        >
          {size.width > 0 ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Svg width={size.width} height={size.height}>
                <Defs>
                  <LinearGradient id="galleryFade" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="rgb(2,3,164)" stopOpacity="0" />
                    <Stop offset="0.35" stopColor="rgb(2,3,164)" stopOpacity="0.22" />
                    <Stop offset="0.7" stopColor="rgb(2,3,164)" stopOpacity="0.5" />
                    <Stop offset="1" stopColor="rgb(2,3,164)" stopOpacity="0.72" />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#galleryFade)" />
              </Svg>
            </View>
          ) : null}

          <View style={styles.content}>
            <View style={styles.copy}>
              <Text style={styles.title}>{t('fullGallery')}</Text>
              <Text style={styles.subtitle}>{t('gallerySubtitle')}</Text>
            </View>

            {/* Background on View — Pressable bg is stripped by NativeWind preflight */}
            <Pressable
              onPress={openCollection}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <View style={styles.cta}>
                <Text style={styles.ctaLabel}>{t('viewCollection')}</Text>
              </View>
            </Pressable>
          </View>
        </ImageBackground>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowWrap: {
    width: '100%',
    height: 226,
    borderRadius: 12,
    backgroundColor: '#0203A4',
    ...shadows.galleryCard,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0203A4',
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 215, 0.1)',
  },
  media: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingVertical: 32,
    paddingHorizontal: 16,
    gap: 24,
  },
  copy: {
    width: '100%',
    maxWidth: 236,
    gap: 8,
    alignItems: 'flex-end',
  },
  title: {
    fontFamily: 'Heebo',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
    letterSpacing: -0.24,
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.9,
  },
  cta: {
    minWidth: 120,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#5957BF',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.14,
    color: '#5957BF',
    textAlign: 'center',
  },
})
