import { useState } from 'react'
import {
  ImageBackground,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import heroRing from '../../../assets/images/home/hero-ring.png'
import { radii, shadows } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'

type HeroDesignCardProps = {
  onPress?: () => void
}

/** Figma Section 1 Hero/Action — Frame 2147225488 (329×356). */
export function HeroDesignCard({ onPress }: HeroDesignCardProps) {
  const { t } = useTranslation()
  const [size, setSize] = useState({ width: 0, height: 0 })

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ width, height })
  }

  return (
    <View style={styles.shadowWrap}>
      <View style={styles.card}>
        <View style={styles.media} onLayout={onLayout}>
          <ImageBackground source={heroRing} style={styles.image} resizeMode="cover">
            {size.width > 0 ? (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Svg width={size.width} height={size.height}>
                  <Defs>
                    <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="rgb(2,3,164)" stopOpacity="0" />
                      <Stop offset="0.5" stopColor="rgb(2,3,164)" stopOpacity="0.236" />
                      <Stop offset="1" stopColor="rgb(2,3,164)" stopOpacity="0.531" />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#heroFade)" />
                </Svg>
              </View>
            ) : null}
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>{t('personalDesign')}</Text>
              <Text style={styles.title}>{t('createMasterpiece')}</Text>
            </View>
          </ImageBackground>
        </View>

        <View style={styles.footer}>
          {/* Background on View — Pressable bg is stripped by NativeWind preflight */}
          <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
            <View style={styles.cta}>
              <Text style={styles.ctaLabel}>{t('startNewDesign')}</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowWrap: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    ...shadows.heroCard,
  },
  card: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 215, 0.1)',
  },
  media: {
    height: 264,
    width: '100%',
  },
  image: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  copy: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 4,
    alignItems: 'flex-end',
  },
  eyebrow: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
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
  footer: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.9,
  },
  cta: {
    width: '100%',
    height: 42,
    borderRadius: radii.md,
    backgroundColor: '#5957BF',
    borderWidth: 1,
    borderColor: '#5957BF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
})
