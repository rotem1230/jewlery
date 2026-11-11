import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import type { Delivery } from '@/src/lib/chatThread'

const READ_TICK = '#4FC3F7'

function DoubleCheck({ color }: { color: string }) {
  return (
    <Svg width={14} height={10} viewBox="0 0 14 10" fill="none">
      <Path d="M1.2 5.2 L3.4 7.4 L7.8 2.2" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5.2 5.2 L7.4 7.4 L12.4 2" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function SingleCheck({ color }: { color: string }) {
  return (
    <Svg width={14} height={10} viewBox="0 0 14 10" fill="none">
      <Path d="M3.2 5.2 L5.4 7.4 L10.4 2" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/** Next to the time of a message the user sent: one grey tick once sent, two blue ticks once read. */
export function DeliveryTick({ delivery }: { delivery: Delivery }) {
  const { t } = useTranslation()
  return (
    <View accessible accessibilityLabel={t(delivery === 'read' ? 'shChatTickRead' : 'shChatTickSent')}>
      {delivery === 'read' ? <DoubleCheck color={READ_TICK} /> : <SingleCheck color={colors.textSecondary} />}
    </View>
  )
}
