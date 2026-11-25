/**
 * A release bundle (Metro --dev false runs Babel with envName "production") must name an https
 * API (src/config/env.ts): the bundling step fails here instead of the app crashing on launch.
 * Xcode archives read the variable from ios/.xcode.env.local, not from the shell.
 */
// Read through a local: when Jest transforms this file, the inline plugin below would otherwise
// freeze `process.env.API_BASE_URL` to its value at transform time.
const { env } = process

function assertReleaseApiUrl() {
  const url = (env.API_BASE_URL || '').trim()
  if (!url) {
    throw new Error('API_BASE_URL must be set for release builds (for Xcode archives: export it in ios/.xcode.env.local)')
  }
  if (!url.startsWith('https://')) {
    throw new Error('API_BASE_URL must use https in release builds')
  }
}

module.exports = (api) => {
  const release = api.env('production')
  api.cache.using(() => env.API_BASE_URL || '')
  if (release) {
    assertReleaseApiUrl()
  }
  return {
    // nativewind/babel already adds the JSX import source and the worklets plugin.
    presets: [['babel-preset-expo', { worklets: false, reanimated: false }], 'nativewind/babel'],
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
}
