import * as jpeg from 'jpeg-js';
import { RgbaImage, decodePng } from './png';

/** Where the piece goes on the photo: centre (fractions of the photo), width and rotation. */
export interface Placement {
  /** Centre, as a fraction of the photo's width (0 = left edge, 1 = right edge). */
  x: number;
  /** Centre, as a fraction of the photo's height (0 = top, 1 = bottom). */
  y: number;
  /** Width of the overlay picture as a fraction of the photo's width. */
  scale: number;
  /** Clockwise rotation in degrees. */
  rotation: number;
}

export const DEFAULT_PLACEMENT: Placement = { x: 0.5, y: 0.55, scale: 0.35, rotation: 0 };

/** Largest photo side kept for a try-on picture (pixels); bigger photos are scaled down. */
export const MAX_PHOTO_SIDE = 1600;
/**
 * Largest photo decoded at all. Decoding holds the whole picture (and, for JPEG, per-block
 * buffers) in memory, so the size is read from the header first and anything bigger is refused.
 * The app scales try-on photos down before uploading them.
 */
export const MAX_DECODE_SIDE = 4096;
export const MAX_DECODE_PIXELS = 12_000_000;

/** Width and height from a JPEG's start-of-frame header (null when there is none). */
export function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = bytes.readUInt16BE(i + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  return null;
}

/** EXIF orientation (1–8) of a JPEG; 1 when absent or unreadable. */
export function jpegOrientation(bytes: Buffer): number {
  let i = 2;
  while (i + 4 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker === 0xe1 && bytes.toString('ascii', i + 4, i + 10) === 'Exif\0\0') {
      const tiff = i + 10;
      const little = bytes.toString('ascii', tiff, tiff + 2) === 'II';
      const u16 = (at: number) => (little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at));
      const u32 = (at: number) => (little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at));
      const end = i + 2 + length;
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > end) return 1;
      const entries = u16(ifd);
      for (let e = 0; e < entries; e++) {
        const entry = ifd + 2 + e * 12;
        if (entry + 12 > end) break;
        if (u16(entry) === 0x0112) {
          const value = u16(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    if (marker === 0xda) break;
    i += 2 + length;
  }
  return 1;
}

/** Turns / mirrors pixels so they show the way the camera meant (EXIF orientation 1–8). */
export function applyOrientation(image: RgbaImage, orientation: number): RgbaImage {
  if (orientation <= 1 || orientation > 8) return image;
  const W = image.width;
  const H = image.height;
  const swap = orientation >= 5;
  const width = swap ? H : W;
  const height = swap ? W : H;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx = x;
      let sy = y;
      if (orientation === 2) sx = W - 1 - x;
      else if (orientation === 3) {
        sx = W - 1 - x;
        sy = H - 1 - y;
      } else if (orientation === 4) sy = H - 1 - y;
      else if (orientation === 5) {
        sx = y;
        sy = x;
      } else if (orientation === 6) {
        sx = y;
        sy = H - 1 - x;
      } else if (orientation === 7) {
        sx = W - 1 - y;
        sy = H - 1 - x;
      } else if (orientation === 8) {
        sx = W - 1 - y;
        sy = x;
      }
      const s = (sy * W + sx) * 4;
      const d = (y * width + x) * 4;
      data[d] = image.data[s];
      data[d + 1] = image.data[s + 1];
      data[d + 2] = image.data[s + 2];
      data[d + 3] = image.data[s + 3];
    }
  }
  return { width, height, data };
}

function assertDecodable(size: { width: number; height: number } | null): void {
  if (!size || size.width <= 0 || size.height <= 0) throw new Error('Unreadable photo');
  if (Math.max(size.width, size.height) > MAX_DECODE_SIDE || size.width * size.height > MAX_DECODE_PIXELS) {
    throw new Error(`Photo is too large (${size.width}×${size.height})`);
  }
}

/**
 * Decodes a JPEG or PNG photo to RGBA, upright (EXIF orientation applied); refuses other types
 * and photos over MAX_DECODE_SIDE / MAX_DECODE_PIXELS before decoding them.
 */
export function decodePhoto(bytes: Buffer, mimeType: string): RgbaImage {
  if (mimeType === 'image/png') {
    assertDecodable(bytes.length >= 24 ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : null);
    return decodePng(bytes, MAX_DECODE_PIXELS);
  }
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    assertDecodable(jpegSize(bytes));
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 12, maxMemoryUsageInMB: 160 });
    return applyOrientation({ width: decoded.width, height: decoded.height, data: decoded.data }, jpegOrientation(bytes));
  }
  throw new Error(`Unsupported photo type ${mimeType}`);
}

export function encodeJpeg(image: RgbaImage, quality = 88): Buffer {
  return Buffer.from(jpeg.encode({ width: image.width, height: image.height, data: image.data }, quality).data);
}

/** Bilinear sample of `image` at (x, y) into `out` (RGBA, 0–255); transparent outside. */
function sample(image: RgbaImage, x: number, y: number, out: Float64Array): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  out[0] = out[1] = out[2] = out[3] = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const px = x0 + i;
      const py = y0 + j;
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      const o = (py * image.width + px) * 4;
      const a = (image.data[o + 3] / 255) * w;
      // Premultiplied, so transparent neighbours do not darken the edge.
      out[0] += image.data[o] * a;
      out[1] += image.data[o + 1] * a;
      out[2] += image.data[o + 2] * a;
      out[3] += a;
    }
  }
}

/** A copy of `image` scaled so its longer side is at most `maxSide` (box filter). */
export function fitWithin(image: RgbaImage, maxSide: number): RgbaImage {
  const k = Math.min(1, maxSide / Math.max(image.width, image.height));
  if (k >= 1) return image;
  const width = Math.max(1, Math.round(image.width * k));
  const height = Math.max(1, Math.round(image.height * k));
  const data = new Uint8Array(width * height * 4);
  const inv = 1 / k;
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y * inv);
    const sy1 = Math.min(image.height, Math.max(sy0 + 1, Math.floor((y + 1) * inv)));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * inv);
      const sx1 = Math.min(image.width, Math.max(sx0 + 1, Math.floor((x + 1) * inv)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * image.width + sx) * 4;
          r += image.data[o];
          g += image.data[o + 1];
          b += image.data[o + 2];
          a += image.data[o + 3];
          n++;
        }
      }
      const d = (y * width + x) * 4;
      data[d] = r / n;
      data[d + 1] = g / n;
      data[d + 2] = b / n;
      data[d + 3] = a / n;
    }
  }
  return { width, height, data };
}

/**
 * Lays `overlay` (a transparent picture of the piece) over `photo` at `placement`, with a soft
 * contact shadow, and returns a new opaque image.
 */
export function composite(photo: RgbaImage, overlay: RgbaImage, placement: Placement): RgbaImage {
  const out: RgbaImage = { width: photo.width, height: photo.height, data: new Uint8Array(photo.data) };
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
  const targetW = Math.max(1, placement.scale * photo.width);
  const k = overlay.width / targetW;
  const angle = (-placement.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = placement.x * photo.width;
  const cy = placement.y * photo.height;
  const half = (Math.hypot(overlay.width, overlay.height) / k) / 2;
  const shadowDx = targetW * 0.015;
  const shadowDy = targetW * 0.025;
  const minX = Math.max(0, Math.floor(cx - half - shadowDx));
  const maxX = Math.min(photo.width - 1, Math.ceil(cx + half + shadowDx));
  const minY = Math.max(0, Math.floor(cy - half - shadowDy));
  const maxY = Math.min(photo.height - 1, Math.ceil(cy + half + shadowDy));
  const px = new Float64Array(4);
  const sh = new Float64Array(4);
  const toOverlay = (x: number, y: number): [number, number] => {
    const dx = x - cx;
    const dy = y - cy;
    return [(dx * cos - dy * sin) * k + overlay.width / 2 - 0.5, (dx * sin + dy * cos) * k + overlay.height / 2 - 0.5];
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const [ox, oy] = toOverlay(x + 0.5, y + 0.5);
      sample(overlay, ox, oy, px);
      const [sx, sy] = toOverlay(x + 0.5 - shadowDx, y + 0.5 - shadowDy);
      sample(overlay, sx, sy, sh);
      if (px[3] <= 0 && sh[3] <= 0) continue;
      const d = (y * photo.width + x) * 4;
      // Shadow first (darkens the photo where the piece would block light), then the piece.
      const shadow = sh[3] * 0.28 * (1 - px[3]);
      for (let c = 0; c < 3; c++) {
        const base = out.data[d + c] * (1 - shadow);
        const value = px[3] > 0 ? base * (1 - px[3]) + px[c] : base;
        out.data[d + c] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }
  }
  return out;
}
