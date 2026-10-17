import * as jpeg from 'jpeg-js';
import { MAX_STONES, buildJewelry, specFromParameters } from './geometry';
import { MAX_DECODE_SIDE, applyOrientation, decodePhoto, jpegOrientation, jpegSize } from './compose';
import { decodePng, encodePng, RgbaImage } from './png';

function image(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = i % 256;
    data[i * 4 + 1] = Math.floor(i / 256) % 256;
    data[i * 4 + 2] = 7;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** A JPEG with an EXIF APP1 segment carrying the given orientation. */
function jpegWithOrientation(orientation: number): Buffer {
  const plain = Buffer.from(jpeg.encode({ width: 4, height: 2, data: image(4, 2).data }, 90).data);
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'ascii');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const app1 = Buffer.alloc(4);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([plain.subarray(0, 2), app1, body, plain.subarray(2)]);
}

describe('photo decoding for try-on', () => {
  it('reads a JPEG size from its header without decoding it', () => {
    const bytes = Buffer.from(jpeg.encode({ width: 40, height: 24, data: image(40, 24).data }, 80).data);
    expect(jpegSize(bytes)).toEqual({ width: 40, height: 24 });
  });

  it('refuses a photo larger than the decode limit before decoding it', () => {
    // A PNG header claiming 5000 × 5000: refused from the header, nothing is inflated.
    const png = encodePng(image(2, 2));
    png.writeUInt32BE(5000, 16);
    png.writeUInt32BE(5000, 20);
    expect(MAX_DECODE_SIDE).toBeLessThan(5000);
    expect(() => decodePhoto(png, 'image/png')).toThrow(/too large/);
  });

  it('a PNG whose data inflates past its declared size is cut off, not allocated', () => {
    const big = encodePng(image(64, 64));
    // Same compressed data, header now claims 2 × 2 pixels.
    big.writeUInt32BE(2, 16);
    big.writeUInt32BE(2, 20);
    expect(() => decodePng(big)).toThrow();
  });

  it('reads the EXIF orientation and turns the pixels upright', () => {
    expect(jpegOrientation(jpegWithOrientation(6))).toBe(6);
    expect(jpegOrientation(Buffer.from(jpeg.encode({ width: 2, height: 2, data: image(2, 2).data }, 90).data))).toBe(1);
    const decoded = decodePhoto(jpegWithOrientation(6), 'image/jpeg');
    // A 4 × 2 sensor image meant to be shown turned 90° clockwise is 2 × 4 upright.
    expect([decoded.width, decoded.height]).toEqual([2, 4]);
  });

  it('applies every EXIF orientation', () => {
    const src = image(3, 2);
    const at = (img: RgbaImage, x: number, y: number) => img.data[(y * img.width + x) * 4];
    // Source top-left pixel value 0; where does it end up?
    const corner = (o: number) => {
      const out = applyOrientation(src, o);
      for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) if (at(out, x, y) === 0 && out.data[(y * out.width + x) * 4 + 1] === 0) return [x, y, out.width, out.height];
      return null;
    };
    expect(corner(1)).toEqual([0, 0, 3, 2]);
    expect(corner(2)).toEqual([2, 0, 3, 2]);
    expect(corner(3)).toEqual([2, 1, 3, 2]);
    expect(corner(4)).toEqual([0, 1, 3, 2]);
    expect(corner(5)).toEqual([0, 0, 2, 3]);
    expect(corner(6)).toEqual([1, 0, 2, 3]);
    expect(corner(7)).toEqual([1, 2, 2, 3]);
    expect(corner(8)).toEqual([0, 2, 2, 3]);
  });
});

describe('geometry bounds', () => {
  it('builds at most MAX_STONES stones whatever the parameters say', () => {
    const many = Array.from({ length: 5000 }, () => ({ stoneCode: 'DIAMOND' }));
    const spec = specFromParameters('RING', { stones: many, elements: Array.from({ length: 5000 }, () => ({ elementCode: 'STAR' })) });
    expect(spec.stones).toHaveLength(MAX_STONES);
    expect(spec.elements.length).toBeLessThanOrEqual(6);
    const triangles = buildJewelry(spec).parts.reduce((s, p) => s + p.mesh.indices.length / 3, 0);
    expect(triangles).toBeLessThan(60_000);
  });
});
