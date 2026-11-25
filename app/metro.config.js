// Expo's Metro config: release bundles (`expo export:embed`, run by the native builds) and OTA
// bundles (`eas update`) both go through it.
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

config.resolver.assetExts = Array.from(new Set([...(config.resolver.assetExts || []), 'glb', 'gltf']))
config.resolver.sourceExts = (config.resolver.sourceExts || []).filter((ext) => ext !== 'glb' && ext !== 'gltf')

module.exports = withNativeWind(config, { input: './global.css' })
