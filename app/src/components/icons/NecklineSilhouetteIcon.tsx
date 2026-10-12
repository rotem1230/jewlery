import Svg, { Circle, Path } from 'react-native-svg'

type NecklineDepth = 'shallow' | 'medium' | 'deep'

type NecklineSilhouetteIconProps = {
  width?: number
  height?: number
  color?: string
  /** How low the collar arc sits — mirrors shorter vs. longer necklace drop. */
  depth?: NecklineDepth
}

const COLLAR_BY_DEPTH: Record<NecklineDepth, { left: number; right: number; bottom: number }> = {
  shallow: { left: 6, right: 18, bottom: 22 },
  medium: { left: 5, right: 19, bottom: 25 },
  deep: { left: 3, right: 21, bottom: 30 },
}

/** Bust silhouette with a collar arc, used to preview necklace drop length. */
export function NecklineSilhouetteIcon({
  width = 24,
  height = 30,
  color = '#5957BF',
  depth = 'medium',
}: NecklineSilhouetteIconProps) {
  const { left, right, bottom } = COLLAR_BY_DEPTH[depth]
  const top = 18
  const midX = (left + right) / 2

  return (
    <Svg width={width} height={height} viewBox="0 0 24 32" fill="none">
      <Circle cx="12" cy="7" r="7" fill="#EFECF8" />
      <Path
        d="M2 32C2 23.7157 6.47715 17 12 17C17.5228 17 22 23.7157 22 32"
        fill="#EFECF8"
      />
      <Path
        d={`M${left} ${top}C${left} ${bottom} ${midX - 4} ${bottom} ${midX} ${bottom}C${midX + 4} ${bottom} ${right} ${bottom} ${right} ${top}`}
        stroke={color}
        strokeWidth={1.8}
        fill="none"
      />
    </Svg>
  )
}
