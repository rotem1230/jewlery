const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withNativeWind } = require('nativewind/metro')

const defaults = getDefaultConfig(__dirname)

/**
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = mergeConfig(defaults, {
  resolver: {
    assetExts: Array.from(new Set([...(defaults.resolver.assetExts || []), 'glb', 'gltf'])),
    sourceExts: (defaults.resolver.sourceExts || []).filter((ext) => ext !== 'glb' && ext !== 'gltf'),
  },
})

module.exports = withNativeWind(config, { input: './global.css' })
