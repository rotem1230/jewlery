/**
 * Try-on placement maths, shared by the placement screen and its tests. A placement is relative
 * to the photo (centre as fractions of its width / height, overlay width as a fraction of its
 * width, rotation in degrees), matching the server's compositor.
 */
export type TryOnPlacementValue = { x: number; y: number; scale: number; rotation: number }

export const MIN_SCALE = 0.05
export const MAX_SCALE = 1.4

/** Keeps a placement within what the server accepts (centre on the photo, sane size). */
export function clampPlacement(p: TryOnPlacementValue): TryOnPlacementValue {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))
  let rotation = Number.isFinite(p.rotation) ? p.rotation % 360 : 0
  if (rotation > 180) rotation -= 360
  if (rotation < -180) rotation += 360
  return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), scale: clamp(p.scale, MIN_SCALE, MAX_SCALE), rotation }
}

/** Where a photo of `photo` size lands inside a `frame` when shown with resizeMode "contain". */
export function placementInPhoto(
  frame: { width: number; height: number },
  photo: { width: number; height: number } | null,
): { x: number; y: number; width: number; height: number } {
  if (!photo || photo.width <= 0 || photo.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const k = Math.min(frame.width / photo.width, frame.height / photo.height)
  const width = photo.width * k
  const height = photo.height * k
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height }
}
