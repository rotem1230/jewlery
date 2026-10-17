import { promisify } from 'util';
import { deflate, deflateSync, inflateSync } from 'zlib';

const deflateAsync = promisify(deflate);

/** 8-bit RGBA pixels, rows top to bottom. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Encodes RGBA pixels as a PNG (RGB when every pixel is opaque). Each row uses the filter with the
 * smallest absolute sum, the usual heuristic for good compression.
 */
export function encodePng(image: RgbaImage): Buffer {
  const rows = filterRows(image);
  let step = rows.next();
  while (!step.done) step = rows.next();
  const { raw, opaque } = step.value;
  return assemble(image, opaque, deflateSync(raw, { level: 6 }));
}

/** Same as encodePng, in slices and with compression off the main thread. */
export async function encodePngAsync(image: RgbaImage): Promise<Buffer> {
  const rows = filterRows(image);
  let step = rows.next();
  while (!step.done) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    step = rows.next();
  }
  const { raw, opaque } = step.value;
  return assemble(image, opaque, await deflateAsync(raw, { level: 6 }));
}

function assemble(image: RgbaImage, opaque: boolean, compressed: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function* filterRows(image: RgbaImage): Generator<void, { raw: Buffer; opaque: boolean }, void> {
  const { width, height, data } = image;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    if (y % 64 === 63) yield;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) row[x * channels + c] = data[(y * width + x) * 4 + c];
    }
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = candidates[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const left = i >= channels ? row[i - channels] : 0;
        const up = y > 0 ? prev[i] : 0;
        const upLeft = i >= channels && y > 0 ? prev[i - channels] : 0;
        const predictor = f === 0 ? 0 : f === 1 ? left : f === 2 ? up : f === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
        const v = (row[i] - predictor) & 0xff;
        out[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    const offset = y * (stride + 1);
    raw[offset] = best;
    raw.set(candidates[best], offset + 1);
    prev.set(row);
  }
  return { raw, opaque };
}

/**
 * Decodes an 8-bit, non-interlaced PNG (grey, grey+alpha, RGB, RGBA or palette) to RGBA. Refuses
 * pictures over `maxPixels`, and never inflates more data than the declared size needs.
 */
export function decodePng(bytes: Buffer, maxPixels = 16_000_000): RgbaImage {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const idat: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!width || !height || width * height > maxPixels) throw new Error('Unsupported PNG size');
  if (depth !== 8 || interlace !== 0) throw new Error('Only 8-bit, non-interlaced PNG files are supported');
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (!channels) throw new Error('Unsupported PNG colour type');
  if (colorType === 3 && !palette) throw new Error('PNG palette missing');
  const stride = width * channels;
  // Bounded: a small file that inflates to gigabytes ("zip bomb") is cut off, not allocated.
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height });
  if (raw.length < (stride + 1) * height) throw new Error('Truncated PNG data');
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[dst + i - channels] : 0;
      const up = y > 0 ? pixels[dst - stride + i] : 0;
      const upLeft = i >= channels && y > 0 ? pixels[dst - stride + i - channels] : 0;
      const value = raw[src + i];
      const predictor =
        filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : -1;
      if (predictor < 0) throw new Error('Invalid PNG filter');
      pixels[dst + i] = (value + predictor) & 0xff;
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const s = p * channels;
    const d = p * 4;
    if (colorType === 6) {
      out[d] = pixels[s];
      out[d + 1] = pixels[s + 1];
      out[d + 2] = pixels[s + 2];
      out[d + 3] = pixels[s + 3];
    } else if (colorType === 2) {
      out[d] = pixels[s];
      out[d + 1] = pixels[s + 1];
      out[d + 2] = pixels[s + 2];
      out[d + 3] = 255;
    } else if (colorType === 3) {
      const index = pixels[s];
      out[d] = palette![index * 3] ?? 0;
      out[d + 1] = palette![index * 3 + 1] ?? 0;
      out[d + 2] = palette![index * 3 + 2] ?? 0;
      out[d + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    } else if (colorType === 4) {
      out[d] = out[d + 1] = out[d + 2] = pixels[s];
      out[d + 3] = pixels[s + 1];
    } else {
      out[d] = out[d + 1] = out[d + 2] = pixels[s];
      out[d + 3] = 255;
    }
  }
  return { width, height, data: out };
}
