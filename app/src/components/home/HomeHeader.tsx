import { type ReactNode } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { ChevronLeft } from 'lucide-react-native'
import { BrandLogo } from '@/src/components/brand/BrandLogo'
import { colors } from '@/src/theme/tokens'

type HomeHeaderProps = {
  backdropColor?: string
  /** Atelier uses the same arch without the brand logo. */
  showLogo?: boolean
  /** Custom center content in the arch bay (e.g. profile avatar). */
  center?: ReactNode
  /** Figma wizard header — back chevron overlaid on the arch bay. */
  onBack?: () => void
}

/**
 * Figma "Mobile Header new":
 * full-bleed white status + arched bottom (Exclude path) + optional center content.
 */
export function HomeHeader({
  backdropColor = '#EFF5FC',
  showLogo = true,
  center,
  onBack,
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scale = width / 375

  // Figma Exclude: h62 with marginBottom -30, then logo/avatar in bay
  const curveHeight = Math.round(62 * scale)
  const pullUp = Math.round(30 * scale)
  const hasCenter = center != null || showLogo

  return (
    <View style={[styles.root, { backgroundColor: backdropColor }]}>
      <View style={[styles.statusFill, { height: insets.top }]} />

      <View style={styles.headerBody}>
        <Svg
          width={width}
          height={curveHeight}
          viewBox="10 0 375 65"
          preserveAspectRatio="none"
          style={{ marginBottom: hasCenter ? -pullUp : 0 }}
        >
          <Path
            d="M385 65C385 37.938 301.053 16 197.5 16C93.9466 16 10 37.938 10 65V0H385V65Z"
            fill="#FFFFFF"
          />
        </Svg>

        {center != null ? (
          <View style={styles.logoSlot}>{center}</View>
        ) : showLogo ? (
          <View style={styles.logoSlot}>
            <BrandLogo />
          </View>
        ) : null}

        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" style={styles.backSlot}>
            <ChevronLeft size={24} color={colors.ink} strokeWidth={1.5} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    zIndex: 2,
  },
  statusFill: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  headerBody: {
    width: '100%',
    alignItems: 'center',
  },
  logoSlot: {
    alignItems: 'center',
    zIndex: 1,
  },
  backSlot: {
    position: 'absolute',
    left: 24,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 3,
  },
})
