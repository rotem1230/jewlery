export type GalleryForPublish = { uploadId?: string; title?: string; persisted?: boolean }

/**
 * The portfolio items the publish step still has to save: pictures with a file that are not in
 * the portfolio yet (the profile form already saved the others), at their place in the gallery.
 */
export function portfolioItemsToAdd(
  gallery: GalleryForPublish[],
): Array<{ uploadId: string; title?: string; sortOrder: number }> {
  return gallery.flatMap((item, index) =>
    item.uploadId && !item.persisted ? [{ uploadId: item.uploadId, title: item.title, sortOrder: index }] : [],
  )
}
