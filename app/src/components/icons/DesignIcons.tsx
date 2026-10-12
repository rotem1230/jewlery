import Svg, { Path } from 'react-native-svg'

type IconProps = {
  width?: number
  height?: number
  color?: string
  opacity?: number
}

/** Figma design-details diamond mark. */
export function DiamondIcon({
  width = 20,
  height = 18,
  color = '#6D28D9',
  opacity = 0.6,
}: IconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 20 18" fill="none">
      <Path
        d="M9.75 0H9.46875L6.79688 5.25H12.4219L9.75 0ZM14.0625 5.25H19.2188L16.5938 0H11.4375L14.0625 5.25ZM18.9844 6.75H10.3594V17.1094L18.9844 6.75ZM8.85938 17.1094V6.75H0.234375L8.85938 17.1094ZM5.15625 5.25L7.78125 0H2.625L0 5.25H5.15625Z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  )
}

/** Four-corner maximize / expand glyph. */
export function MaximizeIcon({
  width = 14,
  height = 14,
  color = '#1E293B',
}: IconProps) {
  const stroke = 1.5
  return (
    <Svg width={width} height={height} viewBox="0 0 14 14" fill="none">
      {/* top-left */}
      <Path d="M1 5V1H5" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {/* top-right */}
      <Path d="M9 1H13V5" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {/* bottom-left */}
      <Path d="M1 9V13H5" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {/* bottom-right */}
      <Path d="M9 13H13V9" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
