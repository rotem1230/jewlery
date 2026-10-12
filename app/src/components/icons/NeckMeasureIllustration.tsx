import Svg, { Path } from 'react-native-svg'

type NeckMeasureIllustrationProps = {
  width?: number
  height?: number
}

/** Neck + shoulders silhouette with three necklace drop lengths and cm tick lines. */
export function NeckMeasureIllustration({
  width = 280,
  height = 220,
}: NeckMeasureIllustrationProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 280 220" fill="none">
      {/* face chin */}
      <Path
        d="M110 10C110 24 118 34 140 34C162 34 170 24 170 10"
        stroke="#1B1B23"
        strokeWidth={1.2}
        fill="none"
      />
      {/* neck + shoulders */}
      <Path
        d="M120 32V54C90 60 60 78 50 110H230C220 78 190 60 160 54V32"
        stroke="#1B1B23"
        strokeWidth={1.2}
        fill="none"
      />

      {/* necklace 1 - choker, 40cm */}
      <Path d="M96 92C110 104 170 104 184 92" stroke="#C59F45" strokeWidth={2} fill="none" />
      {/* necklace 2 - princess, 50cm */}
      <Path d="M86 96C110 130 170 130 194 96" stroke="#D6A84B" strokeWidth={2} fill="none" />
      {/* necklace 3 - matinee, 60cm */}
      <Path d="M76 100C110 158 170 158 204 100" stroke="#E8B95B" strokeWidth={2} fill="none" />

      {/* tick lines to labels */}
      <Path d="M184 92H250" stroke="#C6C5D7" strokeWidth={1} strokeDasharray="3 3" />
      <Path d="M194 130H250" stroke="#C6C5D7" strokeWidth={1} strokeDasharray="3 3" />
      <Path d="M204 158H250" stroke="#C6C5D7" strokeWidth={1} strokeDasharray="3 3" />
    </Svg>
  )
}
