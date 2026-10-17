import { buildJewelry, specFromParameters } from './geometry';
import { modelToObj } from './obj';
import { decodePng, encodePng, encodePngAsync } from './png';
import { renderModel, renderModelAsync, stampWatermark } from './renderer';
import { modelToStl } from './stl';

const ring = (metalCode: string, stoneCode?: string) =>
  buildJewelry(
    specFromParameters('RING', {
      size: { standard: 'IL', sizeCode: '56', bandWidthMm: 3 },
      metal: { metalCode, purityCode: '18K' },
      stones: stoneCode ? [{ stoneCode }] : [],
      setting: stoneCode ? { settingCode: '4_PRONG' } : undefined,
    }),
  );

describe('STL export', () => {
  it('writes every triangle of the model as binary STL in millimetres', () => {
    const model = ring('YELLOW_GOLD', 'DIAMOND');
    const stl = modelToStl(model, 'Malinvosky design test v3 (mm)');
    const count = model.parts.reduce((s, p) => s + p.mesh.indices.length / 3, 0);
    expect(stl.readUInt32LE(80)).toBe(count);
    expect(stl.length).toBe(84 + count * 50);
    expect(stl.toString('ascii', 0, 30)).toContain('Malinvosky design test v3');
    // Vertices are the model's coordinates (a 17.8 mm ring is ~22 mm across, not 1 unit).
    let maxX = -Infinity;
    for (let t = 0; t < count; t++) {
      for (let v = 0; v < 3; v++) maxX = Math.max(maxX, stl.readFloatLE(84 + t * 50 + 12 + v * 12));
    }
    expect(maxX).toBeGreaterThan(10);
    expect(maxX).toBeLessThan(15);
  });

  it('OBJ has one group per part and valid face indices', () => {
    const model = ring('PLATINUM', 'EMERALD');
    const obj = modelToObj(model, 'test').toString('utf8');
    const vertices = obj.split('\n').filter((l) => l.startsWith('v ')).length;
    expect(obj.split('\n').filter((l) => l.startsWith('g '))).toHaveLength(2);
    const maxIndex = Math.max(
      ...obj
        .split('\n')
        .filter((l) => l.startsWith('f '))
        .flatMap((l) => l.slice(2).split(' ').map((t) => Number(t.split('//')[0]))),
    );
    expect(maxIndex).toBe(vertices);
  });
});

describe('rendered pictures', () => {
  const centrePixel = (data: Uint8Array, size: number, x: number, y: number) => {
    const i = (y * size + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  it('draws the piece over the studio backdrop, in the colour of its metal', () => {
    const gold = renderModel(ring('YELLOW_GOLD'), { size: 96, supersample: 1 });
    const white = renderModel(ring('WHITE_GOLD'), { size: 96, supersample: 1 });
    expect(gold.width).toBe(96);
    // The corner is backdrop, the same in both.
    expect(centrePixel(gold.data, 96, 2, 2)).toEqual(centrePixel(white.data, 96, 2, 2));
    // Gold pixels lean yellow (red and green above blue); white gold does not.
    let goldWarm = 0;
    let whiteWarm = 0;
    for (let i = 0; i < gold.data.length; i += 4) {
      if (gold.data[i] - gold.data[i + 2] > 40) goldWarm++;
      if (white.data[i] - white.data[i + 2] > 40) whiteWarm++;
    }
    expect(goldWarm).toBeGreaterThan(200);
    expect(whiteWarm).toBeLessThan(goldWarm / 10);
  });

  it('a transparent render keeps alpha only where the piece is', () => {
    const image = renderModel(ring('ROSE_GOLD', 'RUBY'), { size: 64, supersample: 1, background: 'transparent' });
    expect(image.data[3]).toBe(0);
    let opaque = 0;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(100);
    expect(opaque).toBeLessThan(64 * 64);
  });

  it('the sliced async render gives the same pixels as the blocking one', async () => {
    const model = ring('SILVER', 'SAPPHIRE');
    const a = renderModel(model, { size: 48, supersample: 2 });
    const b = await renderModelAsync(model, { size: 48, supersample: 2 });
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true);
  });

  it('PNG encode / decode round-trips, sync and async', async () => {
    const image = renderModel(ring('YELLOW_GOLD', 'DIAMOND'), { size: 40, supersample: 1, background: 'transparent' });
    const png = encodePng(image);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(Buffer.from(decodePng(png).data).equals(Buffer.from(image.data))).toBe(true);
    expect((await encodePngAsync(image)).equals(png)).toBe(true);
  });

  it('stamps a watermark in the lower-right corner only', () => {
    const image = renderModel(ring('YELLOW_GOLD'), { size: 100, supersample: 1 });
    const before = Buffer.from(image.data);
    const mark = { width: 4, height: 2, data: new Uint8Array(4 * 2 * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 0)) };
    stampWatermark(image, mark);
    const changed: number[] = [];
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i] !== before[i]) changed.push(i / 4);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((p) => p % 100 >= 50 && Math.floor(p / 100) >= 80)).toBe(true);
  });
});
