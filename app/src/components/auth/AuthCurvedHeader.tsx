import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { BrandLogo } from '@/src/components/brand/BrandLogo'
import { colors } from '@/src/theme/tokens'

type AuthCurvedHeaderProps = {
  /** Page background behind the hanging arch sides (auth vs home). */
  backdropColor?: string
}

/**
 * Figma "Mobile Header new" (designed + brand):
 * full-bleed white status + arched bottom + centered logo.
 */
export function AuthCurvedHeader({ backdropColor = colors.authBg }: AuthCurvedHeaderProps) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scale = width / 375

  const curveHeight = Math.round(62 * scale)
  const pullUp = Math.round(30 * scale)

  return (
    <View style={[styles.root, { backgroundColor: backdropColor }]}>
      <View style={[styles.statusFill, { height: insets.top }]} />

      <View style={styles.headerBody}>
        <Svg
          width={width}
          height={curveHeight}
          viewBox="10 0 375 65"
          preserveAspectRatio="none"
          style={{ marginBottom: -pullUp }}
        >
          <Path
            d="M385 65C385 37.938 301.053 16 197.5 16C93.9466 16 10 37.938 10 65V0H385V65Z"
            fill={colors.surface}
          />
        </Svg>

        <View style={styles.logoSlot}>
          <BrandLogo />
        </View>
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
    backgroundColor: colors.surface,
  },
  headerBody: {
    width: '100%',
    alignItems: 'center',
  },
  logoSlot: {
    alignItems: 'center',
    zIndex: 1,
  },
})
