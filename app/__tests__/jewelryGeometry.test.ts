import { JEWELRY_GEOMETRY_JS, JEWELRY_GEOMETRY_SOURCE_SHA256 } from '../src/lib/jewelryGeometry.generated'
import { studioViewerHtml } from '../src/lib/studioViewerHtml'

// The app has no Node typings; only hashing and reading the backend source are needed.
type Crypto = { createHash: (algorithm: string) => { update: (data: string) => { digest: (encoding: 'hex') => string } } }
type Fs = { existsSync: (path: string) => boolean; readFileSync: (path: string, encoding: 'utf8') => string }
type PathModule = { join: (...parts: string[]) => string }
declare const __dirname: string
const { createHash } = require('crypto') as Crypto
const { existsSync, readFileSync } = require('fs') as Fs
const { join } = require('path') as PathModule

type Geometry = {
  specFromParameters: (type: string, parameters: unknown, lookups?: { ringChartDiameterMm?: number | null }) => unknown
  buildJewelry: (spec: unknown) => { parts: Array<{ material: string; code: string; mesh: { positions: number[] } }> }
  modelBounds: (model: unknown) => { min: number[]; max: number[] }
}

function loadGeometry(): Geometry {
  const window: { JewelryGeometry?: Geometry } = {}
  // The viewer runs this exact text in its WebView (our own generated file, not outside input).
  // eslint-disable-next-line no-new-func
  new Function('window', JEWELRY_GEOMETRY_JS)(window)
  return window.JewelryGeometry!
}

describe('3D studio geometry', () => {
  const jewelry = join(__dirname, '..', '..', 'backend', 'src', 'jewelry')
  const sources = ['catalog.ts', 'motifs.ts', 'geometry.ts'].map((file) => join(jewelry, file))

  it('is the backend geometry, unchanged (run scripts/sync-jewelry-geometry.cjs after editing it)', () => {
    if (!sources.every((file) => existsSync(file))) return // app-only checkout (e.g. a cloud build)
    // Line endings do not count (a Windows checkout may turn them into CRLF).
    const joined = sources.map((file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).join('\n')
    expect(JEWELRY_GEOMETRY_SOURCE_SHA256).toBe(createHash('sha256').update(joined).digest('hex'))
  })

  it('the studio has the backend catalogue, unchanged', () => {
    const source = join(jewelry, 'catalog.ts')
    if (!existsSync(source)) return
    const copy = readFileSync(join(__dirname, '..', 'src', 'lib', 'jewelryCatalog.generated.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(copy.endsWith(readFileSync(source, 'utf8').replace(/\r\n/g, '\n'))).toBe(true)
  })

  it('builds the configured ring the same way the server does', () => {
    const geometry = loadGeometry()
    const spec = geometry.specFromParameters('RING', {
      size: { standard: 'IL', sizeCode: '56', bandWidthMm: 4.6 },
      metal: { metalCode: 'ROSE_GOLD', purityCode: '18K' },
      stones: [{ stoneCode: 'SAPPHIRE' }],
      setting: { settingCode: '6_PRONG' },
    })
    const model = geometry.buildJewelry(spec)
    expect(model.parts.map((p) => `${p.material}:${p.code}`)).toEqual(['metal:ROSE_GOLD', 'stone:SAPPHIRE'])
    const { min, max } = geometry.modelBounds(model)
    // Hole of IL 56 (17.83 mm) + two 1.95 mm band walls.
    expect(max[0] - min[0]).toBeCloseTo(21.7, 0)
  })

  it('the viewer page shows only the piece built from its parameters (no other model is loaded)', () => {
    const html = studioViewerHtml({ itemType: 'RING' })
    expect(html).toContain('window.JewelryGeometry = exports')
    expect(html).not.toMatch(/\.glb|GLTFLoader/)
  })
})
