#!/usr/bin/env node
/**
 * Publishes a JS-only (OTA) update through EAS Update.
 *
 *   npm run ota -- "message"              -> both channels (APK testers + TestFlight/store)
 *   npm run ota -- "message" production   -> one channel (preview | production)
 *
 * `eas update` does not read the build profile env in eas.json, and babel.config.js refuses a
 * release bundle without an https API_BASE_URL, so it is set here from the same eas.json value.
 *
 * Only JS/asset changes can ship this way. Any native change (new native package, permission,
 * expo/react-native upgrade) needs a new build AND a new runtimeVersion in app.json plus
 * android/app/src/main/res/values/strings.xml and ios/MalinvoskyApp/Supporting/Expo.plist.
 */
const { spawnSync } = require('child_process')
const path = require('path')

const appDir = path.join(__dirname, '..')
const eas = require(path.join(appDir, 'eas.json'))
const message = process.argv[2]
const channels = process.argv[3] ? [process.argv[3]] : ['preview', 'production']

if (!message) {
  console.error('Usage: npm run ota -- "what changed" [preview|production]')
  process.exit(1)
}
for (const channel of channels) {
  if (!['preview', 'production'].includes(channel)) {
    console.error(`Unknown channel "${channel}" (preview | production)`)
    process.exit(1)
  }
}

const env = { ...process.env, API_BASE_URL: eas.build.base.env.API_BASE_URL }
for (const channel of channels) {
  console.log(`\n=== eas update --channel ${channel} ===`)
  const args = ['update', '--channel', channel, '--environment', channel, '--message', message, '--non-interactive']
  // On Windows eas is a .cmd run through the shell, which splits an unquoted message at its spaces.
  const shellArgs = process.platform === 'win32' ? args.map((arg) => `"${arg.replace(/"/g, '')}"`) : args
  const result = spawnSync('eas', shellArgs, {
    cwd: appDir,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
