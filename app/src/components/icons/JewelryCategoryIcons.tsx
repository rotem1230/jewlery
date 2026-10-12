import Svg, { Circle, Ellipse, Path } from 'react-native-svg'

type IconProps = {
  size?: number
  color?: string
}

/** Two interlocked hoops. */
export function EarringsIcon({ size = 33, color = '#D6A84B' }: IconProps) {
  return (
    <Svg width={size} height={size * (36 / 33)} viewBox="0 0 33 36" fill="none">
      <Circle cx="12" cy="16" r="9.5" stroke={color} strokeWidth={2} />
      <Circle cx="21" cy="24" r="9.5" stroke={color} strokeWidth={2} />
    </Svg>
  )
}

/** Solid gold band, tilted, with a bright highlight arc. */
export function RingIcon({ size = 33, color = '#D6A84B' }: IconProps) {
  return (
    <Svg width={size} height={size * (39 / 33)} viewBox="0 0 33 39" fill="none">
      <Path
        d="M16.5 4.5C24.7 4.5 30.5 11.6 30.5 20.5C30.5 29.4 24.7 34.5 16.5 34.5C8.3 34.5 2.5 29.4 2.5 20.5C2.5 11.6 8.3 4.5 16.5 4.5ZM16.5 10.2C10.9 10.2 8.2 14.9 8.2 20.5C8.2 26.1 10.9 28.8 16.5 28.8C22.1 28.8 24.8 26.1 24.8 20.5C24.8 14.9 22.1 10.2 16.5 10.2Z"
        fill={color}
      />
      <Path
        d="M8 9C10.5 6 13 4.7 16 4.5"
        stroke="#F6E1A8"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )
}

/** Circular cable-chain bracelet with a heart-shaped clasp. */
export function BraceletIcon({ size = 44, color = '#D6A84B' }: IconProps) {
  const cx = 22
  const cy = 24
  const r = 15
  const linkCount = 12
  const links = Array.from({ length: linkCount }).map((_, i) => {
    const angle = (i / linkCount) * Math.PI * 2 - Math.PI / 2
    const lx = cx + r * Math.cos(angle)
    const ly = cy + r * Math.sin(angle)
    const rotation = (angle * 180) / Math.PI + 90
    return { lx, ly, rotation, key: i }
  })

  return (
    <Svg width={size} height={size * (45 / 44)} viewBox="0 0 44 45" fill="none">
      {links.map(({ lx, ly, rotation, key }) => (
        <Ellipse
          key={key}
          cx={lx}
          cy={ly}
          rx={4.6}
          ry={3}
          stroke={color}
          strokeWidth={1.8}
          fill="none"
          transform={`rotate(${rotation} ${lx} ${ly})`}
        />
      ))}
      <Path
        d="M22 6.5C20.8 4.9 18.4 4.6 17 6C15.6 7.4 15.7 9.6 17.2 11L22 15.5L26.8 11C28.3 9.6 28.4 7.4 27 6C25.6 4.6 23.2 4.9 22 6.5Z"
        fill="#F1D89A"
        stroke={color}
        strokeWidth={1}
      />
    </Svg>
  )
}

/** Curb-chain necklace draping into a soft V. */
export function NecklaceIcon({ size = 50, color = '#D6A84B' }: IconProps) {
  const linkCount = 11
  const points = Array.from({ length: linkCount }).map((_, i) => {
    const t = i / (linkCount - 1)
    const x = 6 + t * 38
    // parabolic drape
    const y = 6 + 22 * (1 - Math.pow(2 * t - 1, 2))
    const prevT = Math.max(0, t - 0.001)
    const prevX = 6 + prevT * 38
    const prevY = 6 + 22 * (1 - Math.pow(2 * prevT - 1, 2))
    const rotation = (Math.atan2(y - prevY, x - prevX) * 180) / Math.PI + 90
    return { x, y, rotation, key: i }
  })

  return (
    <Svg width={size} height={size * (40 / 50)} viewBox="0 0 50 40" fill="none">
      {points.map(({ x, y, rotation, key }) => (
        <Ellipse
          key={key}
          cx={x}
          cy={y}
          rx={3.6}
          ry={2.4}
          stroke={color}
          strokeWidth={1.6}
          fill="none"
          transform={`rotate(${rotation} ${x} ${y})`}
        />
      ))}
      <Circle cx="25" cy="30" r="3.4" fill={color} />
    </Svg>
  )
}
