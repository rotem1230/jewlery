module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          '@': '.',
        },
      },
    ],
    // Build-time configuration (see src/config/env.ts). Only these names are inlined.
    ['transform-inline-environment-variables', { include: ['API_BASE_URL', 'GOOGLE_WEB_CLIENT_ID'] }],
  ],
}
