type ConfigApi = { env: (name?: string) => string | boolean; cache: { using: (fn: () => unknown) => unknown } }
type BabelConfigFactory = (api: ConfigApi) => { plugins: unknown[] }

const babelConfig = require('../babel.config.js') as BabelConfigFactory

/** What Babel hands the config while Metro bundles (envName "production" when --dev false). */
function api(envName: string): ConfigApi {
  return {
    env: (name?: string) => (name === undefined ? envName : name === envName),
    cache: { using: (fn) => fn() },
  }
}

describe('release bundle configuration', () => {
  const original = process.env.API_BASE_URL

  afterEach(() => {
    if (original === undefined) delete process.env.API_BASE_URL
    else process.env.API_BASE_URL = original
  })

  it('a release bundle without an https API URL fails to build instead of crashing on launch', () => {
    delete process.env.API_BASE_URL
    expect(() => babelConfig(api('production'))).toThrow(/API_BASE_URL/)
    process.env.API_BASE_URL = 'http://api.example.com/api/v1'
    expect(() => babelConfig(api('production'))).toThrow(/https/)
  })

  it('builds a release bundle with an https API URL, and development without one', () => {
    process.env.API_BASE_URL = 'https://api.example.com/api/v1'
    expect(babelConfig(api('production')).plugins.length).toBeGreaterThan(0)
    delete process.env.API_BASE_URL
    expect(babelConfig(api('development')).plugins.length).toBeGreaterThan(0)
    expect(babelConfig(api('test')).plugins.length).toBeGreaterThan(0)
  })
})
