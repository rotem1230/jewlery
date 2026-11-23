import { type ReactNode } from 'react'
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { ChevronLeft } from 'lucide-react-native'
import { BrandLogo } from '@/src/components/brand/BrandLogo'
import { openAccessibility } from '@/src/lib/accessibilityLink'
import { useTranslation } from '@/src/i18n'
import { colors } from '@/src/theme/tokens'

type HomeHeaderProps = {
  backdropColor?: string
  /** Atelier uses the same arch without the brand logo. */
  showLogo?: boolean
  /** Custom center content in the arch bay (e.g. profile avatar). */
  center?: ReactNode
  /** Figma wizard header — back chevron overlaid on the arch bay. */
  onBack?: () => void
  /** A "?" that explains how to go on from this screen (the client's notes of 23.11). */
  help?: { title: string; body: string }
}

/** The universal accessibility figure (a person in a circle). */
function AccessibilityGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10.2" stroke={color} strokeWidth={1.6} />
      <Circle cx="12" cy="6.9" r="1.45" fill={color} />
      <Path
        d="M7.2 9.6c1.6.5 3.2.75 4.8.75s3.2-.25 4.8-.75M12 10.35v3.4M12 13.75l-2.3 4.3M12 13.75l2.3 4.3"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
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
  help,
}: HomeHeaderProps) {
  const { t } = useTranslation()
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
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('jwBack')} style={styles.backSlot}>
            <ChevronLeft size={24} color={colors.ink} strokeWidth={1.5} />
          </Pressable>
        ) : null}

        {/* Accessibility on every screen; the screen's own "?" beside it when it has one. */}
        <View style={styles.cornerSlot}>
          <Pressable
            onPress={openAccessibility}
            hitSlop={10}
            style={styles.cornerBtn}
            accessibilityRole="button"
            accessibilityLabel={t('a11yOpen')}
          >
            <AccessibilityGlyph color={colors.brand} />
          </Pressable>
          {help ? (
            <Pressable
              onPress={() => Alert.alert(help.title, help.body)}
              hitSlop={10}
              style={styles.cornerBtn}
              accessibilityRole="button"
              accessibilityLabel={t('helpOpen')}
            >
              <Text style={styles.helpMark}>?</Text>
            </Pressable>
          ) : null}
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
  cornerSlot: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    zIndex: 3,
  },
  cornerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3DEF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpMark: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    color: colors.brand,
    marginTop: -1,
  },
})
