import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/src/theme/tokens'

type GalleryWorkCardProps = {
  image: ImageSourcePropType
  title: string
  width?: number
}

const CARD_WIDTH = 156

/** Figma gallery tile — fixed width for horizontal slider. */
export function GalleryWorkCard({ image, title, width = CARD_WIDTH }: GalleryWorkCardProps) {
  return (
    <View style={[styles.card, { width }]}>
      <Image source={image} style={styles.image} resizeMode="cover" />
      <View style={styles.captionWrap}>
        <Text style={styles.caption} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  caption: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: colors.textInverse,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
