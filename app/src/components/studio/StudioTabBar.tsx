import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'

export type StudioTabId = 'size' | 'metal' | 'setting' | 'stone' | 'elements' | 'inspiration'

const TABS: Array<{ id: StudioTabId; labelKey: TranslationKey }> = [
  { id: 'size', labelKey: 'studioTabSize' },
  { id: 'metal', labelKey: 'studioTabMetal' },
  { id: 'setting', labelKey: 'studioTabSetting' },
  { id: 'stone', labelKey: 'studioTabStone' },
  { id: 'elements', labelKey: 'studioTabElements' },
  { id: 'inspiration', labelKey: 'studioTabInspiration' },
]

type StudioTabBarProps = {
  active: StudioTabId | null
  onSelect: (id: StudioTabId) => void
}

function TabGlyph({ id, color }: { id: StudioTabId; color: string }) {
  if (id === 'size') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x="3.2" y="6" width="17.6" height="12" rx="3" stroke={color} strokeWidth={1.7} />
        <Path d="M8 6.2v4.2M12 6.2v3.2M16 6.2v4.2M20 8.5H4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
    )
  }
  if (id === 'metal') {
    const dots = [
      [8, 8],
      [16, 8],
      [8, 12],
      [16, 12],
      [8, 16],
      [16, 16],
    ]
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        {dots.map(([cx, cy]) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.55} fill={color} />
        ))}
      </Svg>
    )
  }
  if (id === 'setting') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x="4" y="8" width="11" height="11" rx="2.2" stroke={color} strokeWidth={1.7} />
        <Path
          d="M11 7.5V4.8h7.2V12M18.2 4.8l-6.2 6.2"
          stroke={color}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    )
  }
  if (id === 'stone') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 3.6 5.4 9.4 12 20.4l6.6-11z"
          stroke={color}
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
        <Path d="M5.6 9.4h12.8" stroke={color} strokeWidth={1.5} />
      </Svg>
    )
  }
  if (id === 'elements') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M8.2 5.2 9.4 8l2.8 1.2L9.4 10.4 8.2 13.2 7 10.4 4.2 9.2 7 8z"
          fill={color}
        />
        <Path
          d="M15.4 9.4 17 13.2l3.8 1.6-3.8 1.6-1.6 3.8-1.6-3.8-3.8-1.6 3.8-1.6z"
          fill={color}
        />
      </Svg>
    )
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="6" width="16" height="12.5" rx="2.2" stroke={color} strokeWidth={1.7} />
      <Path d="M8 15.4 10.4 12l2.2 2.4 2.2-3 3.2 4" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx="9.1" cy="9.2" r={1.05} fill={color} />
    </Svg>
  )
}

export function StudioTabBar({ active, onSelect }: StudioTabBarProps) {
  const { t } = useTranslation()
  const selectedId = active ?? 'size'
  return (
    <View style={styles.row}>
      {TABS.map(({ id, labelKey }) => {
        const selected = selectedId === id
        const color = selected ? colors.textInverse : colors.brand
        return (
          <Pressable
            key={id}
            onPress={() => onSelect(id)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View style={[styles.icon, selected ? styles.iconOn : styles.iconOff]}>
              <TabGlyph id={id} color={color} />
            </View>
            <Text style={[styles.label, selected ? styles.labelOn : null]} numberOfLines={1}>
              {t(labelKey)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: {
    backgroundColor: colors.brand,
  },
  iconOff: {
    backgroundColor: '#EEEAF8',
  },
  label: {
    fontFamily: 'Heebo',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  labelOn: {
    color: colors.brand,
    fontWeight: '500',
  },
})
