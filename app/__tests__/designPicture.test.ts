import { designPicture } from '../src/lib/designPicture'
import { API_BASE_URL } from '../src/lib/api'
import heroRing from '../assets/images/home/hero-ring.png'
import ringArt from '../assets/images/categories/ring.png'
import necklaceArt from '../assets/images/categories/necklace.png'
import braceletArt from '../assets/images/categories/bracelet.png'
import earringsArt from '../assets/images/categories/earrings.png'

const RENDERED = '/uploads/preview-1/content?exp=1&sig=ab'
const THUMB = '/uploads/thumb-1/content?exp=1&sig=cd'

describe('the picture of a design', () => {
  it("is the design's own thumbnail when it has one", () => {
    const picture = designPicture({ thumbnailUrl: THUMB, previewUrl: RENDERED, itemType: { code: 'RING' } })
    expect(picture).toEqual({ source: { uri: `${API_BASE_URL}${THUMB}` }, resizeMode: 'cover', uri: `${API_BASE_URL}${THUMB}` })
    // A listed design's public thumbnail, by upload id.
    expect(designPicture({ thumbnailUploadId: 't-2', previewUrl: RENDERED }).uri).toBe(`${API_BASE_URL}/uploads/t-2/content`)
  })

  it('else the server-rendered picture of this exact design', () => {
    expect(designPicture({ thumbnailUrl: null, thumbnailUploadId: null, previewUrl: RENDERED }).uri).toBe(`${API_BASE_URL}${RENDERED}`)
  })

  it('else the illustration of its item type, drawn at its own size — never a photo of another piece', () => {
    expect(designPicture({ itemType: { code: 'RING' } })).toEqual({ source: ringArt, resizeMode: 'center' })
    expect(designPicture({ itemType: { code: 'NECKLACE' } }).source).toBe(necklaceArt)
    expect(designPicture({ itemType: { code: 'BRACELET' } }).source).toBe(braceletArt)
    expect(designPicture({ itemType: { code: 'EARRINGS' } }).source).toBe(earringsArt)
    for (const design of [null, undefined, {}, { itemType: { code: 'BROOCH' } }]) {
      const picture = designPicture(design)
      expect(picture.source).toBe(ringArt)
      expect(picture.source).not.toBe(heroRing)
      expect(picture.uri).toBeUndefined()
    }
  })
})
