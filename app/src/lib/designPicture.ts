/**
 * The picture of a design wherever it is listed or shown: its own thumbnail, else the
 * server-rendered picture of exactly this design (`previewUrl`), else the illustration of its
 * item type — never a photo of another piece.
 */
import type { ImageSourcePropType } from 'react-native'
import { uploadContentUrl } from '@/src/api/uploads'
import { mediaUrl } from '@/src/lib/media'
import ringArt from '../../assets/images/categories/ring.png'
import necklaceArt from '../../assets/images/categories/necklace.png'
import braceletArt from '../../assets/images/categories/bracelet.png'
import earringsArt from '../../assets/images/categories/earrings.png'

const CATEGORY_ART: Record<string, ImageSourcePropType> = {
  RING: ringArt,
  NECKLACE: necklaceArt,
  BRACELET: braceletArt,
  EARRINGS: earringsArt,
}

export type PicturedDesign =
  | {
      /** Signed thumbnail link (the owner's own designs, drafts included). */
      thumbnailUrl?: string | null
      /** Public thumbnail of a listed design. */
      thumbnailUploadId?: string | null
      /** Signed link to the server-rendered picture of this design. */
      previewUrl?: string | null
      itemType?: { code?: string | null } | null
    }
  | null
  | undefined

export type DesignPicture = {
  source: ImageSourcePropType
  /** A photo fills its frame; the small category illustration is drawn at its own size. */
  resizeMode: 'cover' | 'center'
  /** The remote picture, when there is one (e.g. to open it full screen). */
  uri?: string
}

export function designPicture(design: PicturedDesign): DesignPicture {
  const uri =
    mediaUrl(design?.thumbnailUrl) ??
    (design?.thumbnailUploadId ? uploadContentUrl(design.thumbnailUploadId) : undefined) ??
    mediaUrl(design?.previewUrl)
  if (uri) return { source: { uri }, resizeMode: 'cover', uri }
  return { source: CATEGORY_ART[design?.itemType?.code ?? ''] ?? ringArt, resizeMode: 'center' }
}
