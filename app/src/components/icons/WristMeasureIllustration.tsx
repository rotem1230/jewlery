import Svg, { Circle, Path } from 'react-native-svg'

type WristMeasureIllustrationProps = {
  width?: number
  height?: number
}

/** Line-art hand with a tape measure wrapped around the wrist. */
export function WristMeasureIllustration({
  width = 220,
  height = 180,
}: WristMeasureIllustrationProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 180" fill="none">
      <Path
        d="M20 170C40 140 60 120 70 100C78 84 76 60 80 40C82 30 92 28 94 38L98 80"
        stroke="#1B1B23"
        strokeWidth={1.2}
        fill="none"
      />
      <Path
        d="M98 80L100 34C100 24 110 22 112 32L114 82"
        stroke="#1B1B23"
        strokeWidth={1.2}
        fill="none"
      />
      <Path
        d="M114 78L118 30C119 20 129 19 130 30L132 84"
        stroke="#1B1B23"
        strokeWidth={1.2}
        fill="none"
      />
      <Path
        d="M132 82L136 40C137 31 146 30 147 40L148 90"
        stroke="#1B1B23"
        strokeWidth={1.2}
        fill="none"
      />
      <Path
        d="M148 88C170 92 186 108 190 130C193 148 182 168 160 172C130 178 60 176 30 168"
        stroke="#1B1B23"
        strokeWidth={1.2}
        fill="none"
      />
      {/* bangles */}
      <Circle cx="80" cy="118" r="10" stroke="#C59F45" strokeWidth={2} fill="none" />
      <Circle cx="72" cy="132" r="12" stroke="#D6A84B" strokeWidth={2} fill="none" />
      {/* ring */}
      <Circle cx="120" cy="42" r="6" stroke="#C59F45" strokeWidth={2} fill="none" />
      {/* tape measure strip */}
      <Path d="M78 120 L60 178" stroke="#5957BF" strokeWidth={10} strokeLinecap="round" />
      <Path
        d="M64 138H72M62 148H70M60 158H68M58 168H66"
        stroke="#FFFFFF"
        strokeWidth={1.5}
      />
    </Svg>
  )
}
