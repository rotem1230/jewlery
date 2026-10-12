import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, type ViewStyle, type DimensionValue } from 'react-native'

type SkeletonProps = {
  width?: DimensionValue
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

/**
 * Reusable shimmer placeholder. Compose per-screen skeletons from these
 * blocks so loading states mirror the real layout (no layout shift).
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius, opacity }, style]}
      accessibilityRole="progressbar"
    />
  )
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#E2E8F0',
  },
})
