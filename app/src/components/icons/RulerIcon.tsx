import Svg, { Path } from 'react-native-svg'

type RulerIconProps = {
  size?: number
  color?: string
}

export function RulerIcon({ size = 16, color = '#5957BF' }: RulerIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 8.5L15.5 20.5C16.1 21.1 17 21.1 17.6 20.5L20.5 17.6C21.1 17 21.1 16.1 20.5 15.5L8.5 3.5C7.9 2.9 7 2.9 6.4 3.5L3.5 6.4C2.9 7 2.9 7.9 3.5 8.5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M8 8L10 10M11.5 11.5L13.5 13.5M15 15L17 17" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  )
}
