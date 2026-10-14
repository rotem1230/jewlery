const { patchAudioRecorder } = require('../scripts/patch-native-modules.cjs')

const ORIGINAL = `class RNAudioRecorderPlayerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    fun start() {
        ActivityCompat.requestPermissions((currentActivity)!!, arrayOf(Manifest.permission.RECORD_AUDIO), 0)
        mediaPlayer!!.setDataSource(currentActivity!!.applicationContext, Uri.parse(path), headers)
    }
}`

describe('native module patch for React Native 0.86', () => {
  it('reads the activity from the React context (the module getter no longer exists)', () => {
    const patched = patchAudioRecorder(ORIGINAL)
    expect(patched).toContain('requestPermissions((reactContext.currentActivity)!!')
    expect(patched).toContain('setDataSource(reactContext.applicationContext, Uri.parse(path), headers)')
    expect(patched).not.toMatch(/[^.]currentActivity\)!!|[(\s]currentActivity!!/)
  })

  it('is idempotent: patching a patched file changes nothing', () => {
    const once = patchAudioRecorder(ORIGINAL)
    expect(patchAudioRecorder(once)).toBe(once)
  })

  it('fails loudly when the library changed and the patch no longer applies', () => {
    expect(() => patchAudioRecorder('class Something {}')).toThrow(/react-native-audio-recorder-player/)
  })
})
