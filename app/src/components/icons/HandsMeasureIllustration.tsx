import Svg, { Circle, Path } from 'react-native-svg'

type HandsMeasureIllustrationProps = {
  width?: number
  height?: number
}

/** Two simple hand outlines — one wearing a ring, one wearing a bracelet. */
export function HandsMeasureIllustration({
  width = 280,
  height = 160,
}: HandsMeasureIllustrationProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 280 160" fill="none">
      {/* left hand — ring */}
      <Path
        d="M30 150C34 120 40 100 44 84C46 76 54 76 55 85L58 120M58 118L60 78C61 68 70 67 71 78L73 122M73 120L76 74C77 65 86 64 87 74L88 124M88 122L92 82C93 74 101 74 102 83L104 130C106 145 100 155 86 156C66 158 40 156 30 150Z"
        stroke="#1B1B23"
        strokeWidth={1.1}
        fill="none"
      />
      <Circle cx="70" cy="98" r="6" stroke="#C59F45" strokeWidth={2} fill="none" />

      {/* right hand — bracelet */}
      <Path
        d="M180 150C184 120 190 100 194 84C196 76 204 76 205 85L208 120M208 118L210 78C211 68 220 67 221 78L223 122M223 120L226 74C227 65 236 64 237 74L238 124M238 122L242 82C243 74 251 74 252 83L254 130C256 145 250 155 236 156C216 158 190 156 180 150Z"
        stroke="#1B1B23"
        strokeWidth={1.1}
        fill="none"
      />
      <Path
        d="M186 132C200 140 220 140 236 132"
        stroke="#D6A84B"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )
}
