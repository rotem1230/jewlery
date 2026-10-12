import { Image, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'

type ChatImageViewerProps = {
  imageUri: string | null
  onClose: () => void
}

/** Fullscreen photo viewer — image contain over black, X closes (top-right). */
export function ChatImageViewer({ imageUri, onClose }: ChatImageViewerProps) {
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={imageUri !== null}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        ) : null}
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { top: Math.max(insets.top, 12) }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
        >
          <X size={22} color="#1B1B23" strokeWidth={2.5} />
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
})
