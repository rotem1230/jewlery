import { StyleSheet, View, useWindowDimensions } from 'react-native'

const TILE = 48

/** Figma faint checkerboard texture behind the design-wizard steps. */
export function CheckerBackdrop() {
  const { width, height } = useWindowDimensions()
  const columns = Math.ceil(width / TILE)
  const rows = Math.ceil(height / TILE)

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: rows }).map((_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: columns }).map((_, col) => {
            const isDark = (row + col) % 2 === 0
            return (
              <View
                key={col}
                style={[styles.tile, isDark ? styles.tileDark : styles.tileLight]}
              />
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  tile: {
    width: TILE,
    height: TILE,
  },
  tileLight: {
    backgroundColor: 'transparent',
  },
  tileDark: {
    backgroundColor: 'rgba(198, 197, 215, 0.06)',
  },
})
