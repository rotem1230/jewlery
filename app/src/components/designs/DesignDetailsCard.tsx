import {
  Image,
  type ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { DiamondIcon, MaximizeIcon } from '@/src/components/icons/DesignIcons'
import { SpecGrid } from '@/src/components/designs/SpecGrid'
import { colors, radii } from '@/src/theme/tokens'

export type DesignSpec = {
  label: string
  value: string
  fullWidth?: boolean
}

type DesignDetailsCardProps = {
  sectionTitle: string
  image: ImageSourcePropType
  /** `center` draws a small illustration at its own size (a design without a picture). */
  imageResizeMode?: 'cover' | 'center'
  title: string
  quote: string
  specs: DesignSpec[]
  /** Opens the picture full screen; without it (no real picture) the button is not shown. */
  onMaximize?: () => void
}

/** Figma design-details white card: header + hero image + copy + spec grid. */
export function DesignDetailsCard({
  sectionTitle,
  image,
  imageResizeMode = 'cover',
  title,
  quote,
  specs,
  onMaximize,
}: DesignDetailsCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        <DiamondIcon />
      </View>

      <View style={styles.media}>
        <Image source={image} style={styles.image} resizeMode={imageResizeMode} />
        {onMaximize ? (
          <View style={styles.maximizeAnchor} pointerEvents="box-none">
            <Pressable
              onPress={onMaximize}
              accessibilityRole="button"
              accessibilityLabel="Maximize"
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <View style={styles.maximizeBtn}>
                <MaximizeIcon />
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.quote}>{quote}</Text>
        </View>
        <SpecGrid items={specs} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderNav,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionTitle: {
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 28,
    color: '#1E293B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  media: {
    width: '100%',
    aspectRatio: 341 / 356,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  maximizeAnchor: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    zIndex: 2,
  },
  maximizeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  pressed: {
    opacity: 0.85,
  },
  body: {
    width: '100%',
    padding: 16,
    gap: 16,
  },
  copy: {
    width: '100%',
    gap: 4,
    alignItems: 'flex-end',
  },
  title: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    color: '#1E293B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  quote: {
    width: '100%',
    // Heebo has no italic face — use system italic so the slant actually renders
    fontFamily: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'System' }),
    fontSize: 14,
    fontWeight: '400',
    fontStyle: 'italic',
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
