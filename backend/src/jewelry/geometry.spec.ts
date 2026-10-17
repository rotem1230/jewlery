import { buildJewelry, modelBounds, ringInnerDiameterMm, specFromParameters, JewelryModel } from './geometry';

const triangles = (model: JewelryModel, material?: 'metal' | 'stone') =>
  model.parts.filter((p) => !material || p.material === material).reduce((s, p) => s + p.mesh.indices.length / 3, 0);

describe('jewelry geometry', () => {
  it('sizes a ring from its Israeli / US size and the size chart', () => {
    expect(ringInnerDiameterMm('IL', '56')).toBeCloseTo(56 / Math.PI, 2);
    expect(ringInnerDiameterMm('US', '7')).toBeCloseTo(11.63 + 0.8128 * 7, 2);
    expect(ringInnerDiameterMm('IL', '56', 17.83)).toBe(17.83);
  });

  it('builds the ring the designer configured: inner diameter, band width, head and stone', () => {
    const spec = specFromParameters('RING', {
      size: { standard: 'IL', sizeCode: '56', bandWidthMm: 4.6 },
      metal: { metalCode: 'ROSE_GOLD', purityCode: '18K' },
      stones: [{ stoneCode: 'SAPPHIRE', placement: { x: 1, y: 0, z: 0.14 } }],
      setting: { settingCode: '6_PRONG' },
    });
    const model = buildJewelry(spec);
    const metal = model.parts.find((p) => p.material === 'metal')!;
    expect(metal.code).toBe('ROSE_GOLD');
    expect(model.parts.filter((p) => p.material === 'stone').map((p) => p.code)).toEqual(['SAPPHIRE']);

    // The band: width along the finger axis, hole of the size's diameter.
    const { min, max } = modelBounds(model);
    expect(max[2] - min[2]).toBeGreaterThanOrEqual(4.6 - 0.01);
    const p = metal.mesh.positions;
    let innerRadius = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i + 1] < 0) innerRadius = Math.min(innerRadius, Math.hypot(p[i], p[i + 1]));
    }
    expect(innerRadius * 2).toBeCloseTo(56 / Math.PI, 1);
    // The head and stone stand above the band.
    expect(max[1]).toBeGreaterThan(56 / Math.PI / 2 + spec.ring.bandThicknessMm + 3);
  });

  it('a 6-prong head has more metal than a 4-prong one, a bezel differs from both', () => {
    const ring = (settingCode: string) =>
      buildJewelry(
        specFromParameters('RING', { size: { standard: 'IL', sizeCode: '54' }, stones: [{ stoneCode: 'DIAMOND' }], setting: { settingCode } }),
      );
    const four = triangles(ring('4_PRONG'), 'metal');
    const six = triangles(ring('6_PRONG'), 'metal');
    const bezel = triangles(ring('BEZEL'), 'metal');
    expect(six).toBeGreaterThan(four);
    expect(new Set([four, six, bezel]).size).toBe(3);
  });

  it('a wider band and a bigger size make a bigger ring', () => {
    const narrow = modelBounds(buildJewelry(specFromParameters('RING', { size: { standard: 'IL', sizeCode: '52', bandWidthMm: 2 } })));
    const wide = modelBounds(buildJewelry(specFromParameters('RING', { size: { standard: 'IL', sizeCode: '62', bandWidthMm: 6 } })));
    expect(wide.max[2] - wide.min[2]).toBeGreaterThan(narrow.max[2] - narrow.min[2] + 3.9);
    expect(wide.max[0] - wide.min[0]).toBeGreaterThan(narrow.max[0] - narrow.min[0] + 2.9);
  });

  it('pavé sets a row of stones of the chosen kind into the band', () => {
    const model = buildJewelry(
      specFromParameters('RING', { size: { standard: 'IL', sizeCode: '54', bandWidthMm: 2 }, stones: [{ stoneCode: 'RUBY' }], setting: { settingCode: 'PAVE' } }),
    );
    const rubies = model.parts.find((p) => p.code === 'RUBY')!;
    // Each round stone has 16 × 4 + 1 faces (table fanned into 14 triangles).
    expect(rubies.mesh.indices.length / 3).toBeGreaterThan(5 * 60);
  });

  it('places accent stones and elements on the band', () => {
    const plain = buildJewelry(specFromParameters('RING', { size: { standard: 'IL', sizeCode: '54' } }));
    const decorated = buildJewelry(
      specFromParameters('RING', {
        size: { standard: 'IL', sizeCode: '54' },
        stones: [{ stoneCode: 'DIAMOND' }, { stoneCode: 'EMERALD', placement: { x: -1, y: 0, z: 0.14 } }],
        elements: [{ elementCode: 'HEART', placement: { x: 0, y: -1, z: 0.14 } }],
      }),
    );
    expect(decorated.parts.map((p) => p.code).sort()).toEqual(['DIAMOND', 'EMERALD', 'YELLOW_GOLD']);
    expect(triangles(decorated, 'metal')).toBeGreaterThan(triangles(plain, 'metal'));
    // The element sits on the bottom of the band (y < 0), beyond its outer surface.
    const { min } = modelBounds(decorated);
    expect(min[1]).toBeLessThan(modelBounds(plain).min[1] - 0.5);
  });

  it('a necklace chain is as long as the chosen length; a bracelet fits the wrist', () => {
    const necklace = buildJewelry(specFromParameters('NECKLACE', { size: { necklaceLengthCm: 45 } }));
    const n = modelBounds(necklace);
    const a = (n.max[0] - n.min[0]) / 2;
    const b = (n.max[1] - n.min[1]) / 2;
    const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    expect(perimeter).toBeGreaterThan(440);
    expect(perimeter).toBeLessThan(480);

    const bracelet = modelBounds(buildJewelry(specFromParameters('BRACELET', { size: { wristCircumferenceCm: 16 } })));
    // Inner circumference = wrist + 15 mm ease; the outer width adds the chain links.
    expect(bracelet.max[0] - bracelet.min[0]).toBeGreaterThan(175 / Math.PI);
    expect(bracelet.max[0] - bracelet.min[0]).toBeLessThan(175 / Math.PI + 6);
  });

  it('earrings come as a pair, studs or drops', () => {
    const studs = buildJewelry(specFromParameters('EARRINGS', { size: { earringStyleCode: 'stud' }, stones: [{ stoneCode: 'DIAMOND' }] }));
    const drops = buildJewelry(specFromParameters('EARRINGS', { size: { earringStyleCode: 'drop' }, stones: [{ stoneCode: 'DIAMOND' }] }));
    const s = modelBounds(studs);
    const d = modelBounds(drops);
    expect(s.min[0]).toBeLessThan(-10);
    expect(s.max[0]).toBeGreaterThan(10);
    // Drops hang: much taller than studs.
    expect(d.max[1] - d.min[1]).toBeGreaterThan(s.max[1] - s.min[1] + 10);
  });

  it('is deterministic and tolerates missing or malformed parameters', () => {
    const params = { size: { standard: 'IL', sizeCode: '58' }, stones: [{ stoneCode: 'RUBY' }] };
    expect(JSON.stringify(buildJewelry(specFromParameters('RING', params)).parts)).toBe(
      JSON.stringify(buildJewelry(specFromParameters('RING', params)).parts),
    );
    for (const junk of [null, {}, { size: 'x', stones: 'y', metal: 3 }, { stones: [null, 1, { stoneCode: '' }] }]) {
      const model = buildJewelry(specFromParameters('RING', junk));
      expect(triangles(model)).toBeGreaterThan(1000);
    }
  });

  it('every mesh is finite and indexes only its own vertices', () => {
    for (const type of ['RING', 'NECKLACE', 'BRACELET', 'EARRINGS']) {
      const model = buildJewelry(
        specFromParameters(type, {
          stones: [{ stoneCode: 'DIAMOND' }, { stoneCode: 'RUBY' }],
          elements: [{ elementCode: 'STAR' }],
          setting: { settingCode: 'BEZEL' },
        }),
      );
      for (const part of model.parts) {
        const count = part.mesh.positions.length / 3;
        expect(part.mesh.positions.every(Number.isFinite)).toBe(true);
        expect(part.mesh.normals.every(Number.isFinite)).toBe(true);
        expect(part.mesh.indices.every((i) => i >= 0 && i < count)).toBe(true);
      }
    }
  });
});
