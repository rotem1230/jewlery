import { linkForUpload, nextLinkRefreshDelay } from '../src/lib/media'

const signed = (id: string, exp: number) => `/uploads/${id}/content?exp=${exp}&sig=${'a'.repeat(64)}`

describe('signed media links', () => {
  it('prefers the freshest link that serves the current file, skipping links of a replaced one', () => {
    const fromServer = signed('new-model', 2_000)
    const kept = signed('new-model', 1_000)
    expect(linkForUpload('new-model', fromServer, kept)).toBe(fromServer)
    expect(linkForUpload('new-model', undefined, kept)).toBe(kept)
    expect(linkForUpload('new-model', signed('old-model', 3_000), kept)).toBe(kept)
    expect(linkForUpload(undefined, fromServer)).toBeUndefined()
  })

  it('schedules a reload a minute before the first link on screen expires', () => {
    const now = 1_000_000
    const links = [signed('a', 1_000 + 900), signed('b', 1_000 + 300), null, '/uploads/c/content']
    expect(nextLinkRefreshDelay(links, now)).toBe((300 - 60) * 1000)
  })

  it('reloads soon (not in a tight loop) when a link already expired, and never without signed links', () => {
    expect(nextLinkRefreshDelay([signed('a', 10)], 1_000_000)).toBe(5_000)
    expect(nextLinkRefreshDelay(['/uploads/c/content', undefined], 1_000_000)).toBeNull()
  })
})
