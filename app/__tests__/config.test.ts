import { resolveApiBaseUrl } from '../src/config/env'

describe('API base URL', () => {
  it('defaults to the local backend in development', () => {
    expect(resolveApiBaseUrl({ dev: true })).toBe('http://localhost:3000/api/v1')
  })

  it('uses the configured URL, without a trailing slash', () => {
    expect(resolveApiBaseUrl({ dev: false, configured: 'https://api.example.com/api/v1/' })).toBe(
      'https://api.example.com/api/v1',
    )
  })

  it('refuses a release build without an https API URL', () => {
    expect(() => resolveApiBaseUrl({ dev: false })).toThrow(/API_BASE_URL/)
    expect(() => resolveApiBaseUrl({ dev: false, configured: 'http://api.example.com/api/v1' })).toThrow(/https/)
  })
})
