/**
 * Runs after every install (package.json "postinstall"), also on the EAS build servers.
 *
 * react-native-audio-recorder-player 3.6.x reads `currentActivity` from ReactContextBaseJavaModule,
 * a getter React Native 0.86 no longer has: the Android release build fails to compile. The module
 * keeps its ReactApplicationContext as `reactContext`, which still exposes the current activity.
 * If the library changes and the patch no longer applies, the install fails here (not later, as a
 * build error on a remote server).
 */
const fs = require('fs')
const path = require('path')

const AUDIO_RECORDER = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-audio-recorder-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'dooboolab.audiorecorderplayer',
  'RNAudioRecorderPlayerModule.kt'
)

const PATCHED_MARK = 'reactContext.currentActivity'

function patchAudioRecorder(source) {
  const next = source
    .replace(/\(currentActivity\)!!/g, '(reactContext.currentActivity)!!')
    .replace(/currentActivity!!\.applicationContext/g, 'reactContext.applicationContext')
  if (!next.includes(PATCHED_MARK)) {
    throw new Error(
      'patch-native-modules: react-native-audio-recorder-player changed; review the patch in app/scripts/patch-native-modules.cjs'
    )
  }
  return next
}

function main() {
  if (!fs.existsSync(AUDIO_RECORDER)) {
    // Not installed (e.g. a partial install); nothing to patch.
    return
  }
  const source = fs.readFileSync(AUDIO_RECORDER, 'utf8')
  const patched = patchAudioRecorder(source)
  if (patched !== source) {
    fs.writeFileSync(AUDIO_RECORDER, patched)
    console.log('patch-native-modules: patched react-native-audio-recorder-player for React Native 0.86')
  }
}

if (require.main === module) {
  main()
}

module.exports = { patchAudioRecorder }
