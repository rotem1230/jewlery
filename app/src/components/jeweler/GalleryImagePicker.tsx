import { Image, type ImageSourcePropType, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Plus, X } from 'lucide-react-native'
import { colors, radii } from '@/src/theme/tokens'

export type GalleryImageItem = {
  id: string
  image: ImageSourcePropType
}

type GalleryImagePickerProps = {
  images: GalleryImageItem[]
  onAdd: () => void
  onRemove: (id: string) => void
}

/** Figma gallery grid — add tile + uploaded thumbnails with a remove badge. */
export function GalleryImagePicker({ images, onAdd, onRemove }: GalleryImagePickerProps) {
  return (
    <View style={styles.grid}>
      {images.map((item) => (
        <View key={item.id} style={styles.thumbSlot}>
          <Image source={item.image} style={styles.thumb} resizeMode="cover" />
          <TouchableOpacity
            style={styles.removeBadge}
            onPress={() => onRemove(item.id)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <X size={12} color={colors.textInverse} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addTile} onPress={onAdd} accessibilityRole="button">
        <Plus size={24} color={colors.textSecondary} strokeWidth={1.75} />
      </TouchableOpacity>
    </View>
  )
}

const TILE_SIZE = 96

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  thumbSlot: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  removeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(27, 27, 35, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
})
