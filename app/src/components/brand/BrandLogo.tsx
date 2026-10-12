import { Image, View } from 'react-native'
import { cn } from '@/src/lib/cn'
import logoSource from '../../../assets/images/malinovsky-logo.png'

/** Intrinsic size from the brand SVG export (103×56). */
const LOGO_WIDTH = 103
const LOGO_HEIGHT = 56

type BrandLogoProps = {
  className?: string
  size?: 'sm' | 'md'
}

/** Brand mark from `assets/images/malinovsky-logo` (SVG export → PNG). */
export function BrandLogo({ className, size = 'md' }: BrandLogoProps) {
  const scale = size === 'sm' ? 0.78 : 1
  const width = Math.round(LOGO_WIDTH * scale)
  const height = Math.round(LOGO_HEIGHT * scale)

  return (
    <View
      className={cn('items-center', className)}
      accessibilityRole="image"
      accessibilityLabel="malinovsky handmade jewelry"
    >
      <Image
        source={logoSource}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  )
}
