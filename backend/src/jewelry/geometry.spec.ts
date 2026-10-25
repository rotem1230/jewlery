import { ELEMENTS, SETTINGS, bandMetalThicknessMm, placementControls } from './catalog';
import { buildJewelry, modelBounds, placementFromPoint, ringInnerDiameterMm, specFromParameters, JewelryModel } from './geometry';

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
    // A stone's part carries its colour: a diamond starts as the chart's Crystal.
    expect(decorated.parts.map((p) => p.code).sort()).toEqual(['CRYSTAL', 'EMERALD', 'YELLOW_GOLD']);
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

describe('the client catalogue in the geometry', () => {
  const ring = (params: Record<string, unknown>) =>
    buildJewelry(specFromParameters('RING', { size: { standard: 'IL', sizeCode: '54', bandWidthMm: 4 }, ...params }));
  const stoneParts = (model: JewelryModel) => model.parts.filter((p) => p.material === 'stone');
  const centroid = (positions: number[]): [number, number, number] => {
    const c: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) c[k] += positions[i + k];
    return c.map((v) => v / (positions.length / 3)) as [number, number, number];
  };

  it('a stone is drawn in its chart colour and cut; opal, lapis and turquoise only as cabochons', () => {
    const spec = specFromParameters('RING', { stones: [{ stoneCode: 'OPAL', cutCode: 'ROUND', colorCode: 'PADPARADSCHA' }] });
    expect(spec.stones[0]).toMatchObject({ code: 'OPAL', shape: 'CABOCHON', color: 'PADPARADSCHA', opaque: true });
    const parts = stoneParts(buildJewelry(spec));
    expect(parts.map((p) => [p.code, p.opaque])).toEqual([['PADPARADSCHA', true]]);
    // A colour not in the chart: the stone's own colour.
    expect(specFromParameters('RING', { stones: [{ stoneCode: 'RUBY', colorCode: 'NOT_A_COLOUR' }] }).stones[0].color).toBe('RUBY');
    for (const cutCode of ['ROUND', 'OVAL', 'EMERALD', 'CABOCHON', 'CABOCHON_OVAL', 'ROSE']) {
      const model = ring({ stones: [{ stoneCode: 'SAPPHIRE', cutCode, sizeMm: 6 }] });
      expect({ cutCode, triangles: triangles(model, 'stone') > 20 }).toEqual({ cutCode, triangles: true });
    }
  });

  it('every head of the client pictures holds the centre stone with its own metal', () => {
    const heads = SETTINGS.filter((s) => s.kind === 'HEAD');
    expect(heads).toHaveLength(11);
    const plain = triangles(ring({}), 'metal');
    const counts = heads.map((h) => {
      const model = ring({ stones: [{ stoneCode: 'DIAMOND', sizeMm: 6 }], setting: { headCode: h.code } });
      expect(model.spec.setting).toBe(h.code);
      const metal = model.parts.find((p) => p.material === 'metal')!.mesh.positions;
      let sum = 0;
      for (let i = 0; i < metal.length; i++) sum += Math.abs(metal[i]) * ((i % 7) + 1);
      return { added: triangles(model, 'metal') - plain, signature: `${triangles(model, 'metal')}:${sum.toFixed(1)}` };
    });
    counts.forEach((c) => expect(c.added).toBeGreaterThan(10));
    // Each head is its own shape (two can share a triangle count: compare the metal too).
    expect(new Set(counts.map((c) => c.signature)).size).toBe(heads.length);
    // The bridge-accent head carries a small extra stone.
    const bridge = ring({ stones: [{ stoneCode: 'RUBY', sizeMm: 6 }], setting: { headCode: 'BRIDGE_ACCENT' } });
    expect(stoneParts(bridge).map((p) => p.code).sort()).toEqual(['CRYSTAL', 'RUBY']);
  });

  it('every band style of the pictures sets a row of stones; the band is as thick as the pavé table asks', () => {
    const bands = SETTINGS.filter((s) => s.kind === 'BAND');
    expect(bands).toHaveLength(11);
    const plainMetal = triangles(ring({}), 'metal');
    // One stone of the row: what each stone adds.
    const perStone = triangles(ring({ setting: { band: { settingCode: 'BAND_GYPSY_FLUSH', stoneCode: 'DIAMOND', stoneSizeMm: 2, count: 1 } } }), 'stone');
    const metal = bands.map((b) => {
      const model = ring({ setting: { band: { settingCode: b.code, stoneCode: 'TSAVORITE', colorCode: 'FERN_GREEN', stoneSizeMm: 2, rows: b.minRows, count: 9 } } });
      expect(model.spec.band).toMatchObject({ code: b.code, stoneMm: 2, count: 9, rows: b.minRows });
      expect(model.spec.ring.bandThicknessMm).toBeGreaterThanOrEqual(bandMetalThicknessMm(2));
      // 9 stones a row, each a round brilliant.
      expect(triangles(model, 'stone')).toBe(9 * b.minRows * perStone);
      return triangles(model, 'metal') - plainMetal;
    });
    expect(new Set(metal).size).toBe(bands.length);
  });

  it('pavé takes two or three rows; the row sits where the user puts it', () => {
    const three = buildJewelry(
      specFromParameters('RING', {
        size: { standard: 'IL', sizeCode: '54', bandWidthMm: 5 },
        setting: { band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', stoneSizeMm: 1, rows: 3, count: 10 } },
      }),
    );
    expect(three.spec.band?.rows).toBe(3);
    const one = triangles(ring({ setting: { band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', stoneSizeMm: 1, rows: 2, count: 1 } } }), 'stone') / 2;
    expect(triangles(three, 'stone')).toBe(30 * one);
    const right = ring({ setting: { band: { settingCode: 'BAND_CHANNEL', stoneCode: 'DIAMOND', stoneSizeMm: 1.5, count: 5, placement: { angleDeg: 0 } } } });
    const [x, y] = centroid(stoneParts(right)[0].mesh.positions);
    expect(x).toBeGreaterThan(8);
    expect(Math.abs(y)).toBeLessThan(2);
  });

  it('a band setting keeps clear of the centre stone and of what the user put on the band, on both sides', () => {
    const angleOf = (positions: number[]) => {
      const out: number[] = [];
      for (let i = 0; i < positions.length; i += 3) out.push((Math.atan2(positions[i + 1], positions[i]) * 180) / Math.PI);
      return out;
    };
    const band = { settingCode: 'BAND_CHANNEL', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 2, count: 8 };
    const one = triangles(ring({ setting: { headCode: 'NONE', band: { ...band, count: 1 } } }), 'stone');
    // The row centred on the top, where the ruby's head stands: the eight diamonds go to its two sides.
    const model = ring({ stones: [{ stoneCode: 'RUBY', sizeMm: 6 }], setting: { headCode: 'BASKET', band } });
    const diamonds = model.parts.find((p) => p.material === 'stone' && p.code === 'CRYSTAL')!;
    expect(diamonds.mesh.indices.length / 3).toBe(8 * one);
    const fromTop = angleOf(diamonds.mesh.positions).map((a) => a - 90);
    const ro = modelBounds(ring({})).max[0];
    const headHalf = ((3 + 0.4) / ro) * (180 / Math.PI);
    expect(fromTop.every((d) => Math.abs(d) >= headHalf)).toBe(true);
    expect(fromTop.some((d) => d > 0) && fromTop.some((d) => d < 0)).toBe(true);
    // A star the user put at the bottom, on a row there: the row makes room for it.
    const starred = ring({
      setting: { headCode: 'NONE', band: { ...band, count: 6, placement: { angleDeg: 270 } } },
      elements: [{ elementCode: 'STAR', sizeMm: 5, placement: { angleDeg: 270 } }],
    });
    const row = starred.parts.find((p) => p.material === 'stone' && p.code === 'CRYSTAL')!;
    const fromBottom = angleOf(row.mesh.positions).map((a) => Math.abs(Math.atan2(Math.sin(((a - 270) * Math.PI) / 180), Math.cos(((a - 270) * Math.PI) / 180))) * (180 / Math.PI));
    expect(Math.min(...fromBottom)).toBeGreaterThan(((2.5 + 0.1) / ro) * (180 / Math.PI));
    // Nothing in the way: the row is where it always was.
    const plain = ring({ setting: { headCode: 'NONE', band: { ...band, placement: { angleDeg: 270 } } } });
    expect(triangles(plain, 'stone')).toBe(8 * one);
  });

  it('the centre stone and its head go where the user puts them, turned as asked', () => {
    const top = ring({ stones: [{ stoneCode: 'EMERALD', cutCode: 'EMERALD', sizeMm: 7, placement: { angleDeg: 90 } }], setting: { headCode: 'BASKET' } });
    const side = ring({
      stones: [{ stoneCode: 'EMERALD', cutCode: 'EMERALD', sizeMm: 7, placement: { angleDeg: 0, rotationDeg: 90 } }],
      setting: { headCode: 'BASKET' },
    });
    expect(centroid(stoneParts(top)[0].mesh.positions)[1]).toBeGreaterThan(10);
    const [sx, sy] = centroid(stoneParts(side)[0].mesh.positions);
    expect(sx).toBeGreaterThan(10);
    expect(Math.abs(sy)).toBeLessThan(1);
    // Turned 90°: the long side runs along the finger instead of along the band.
    const extent = (m: JewelryModel, k: number) => {
      const p = stoneParts(m)[0].mesh.positions;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = k; i < p.length; i += 3) {
        lo = Math.min(lo, p[i]);
        hi = Math.max(hi, p[i]);
      }
      return hi - lo;
    };
    expect(extent(side, 2)).toBeGreaterThan(6.5);
  });

  it('accent stones and elements sit at their angle and across the band where the user puts them', () => {
    const model = ring({
      setting: { headCode: 'NONE' },
      stones: [{ stoneCode: 'AMETHYST', sizeMm: 2, placement: { angleDeg: 180, offsetMm: 1 } }],
      elements: [{ elementCode: 'STAR', sizeMm: 5, placement: { angleDeg: 0, offsetMm: -1, rotationDeg: 30 } }],
    });
    const [ax, , az] = centroid(stoneParts(model)[0].mesh.positions);
    expect(ax).toBeLessThan(-8);
    expect(az).toBeCloseTo(1, 0);
    const plain = ring({ setting: { headCode: 'NONE' } });
    expect(modelBounds(model).max[0]).toBeGreaterThan(modelBounds(plain).max[0] + 0.9);
  });

  it('every element of the sheet builds on a ring, a necklace, a bracelet and earrings; text elements carry their text', () => {
    for (const def of ELEMENTS) {
      for (const type of ['RING', 'NECKLACE', 'BRACELET', 'EARRINGS']) {
        const model = buildJewelry(
          specFromParameters(type, { elements: [{ elementCode: def.code, text: def.code === 'NUMBERS' ? '18' : 'דנ', sizeMm: def.minMm }] }),
        );
        for (const part of model.parts) {
          expect(part.mesh.positions.every(Number.isFinite)).toBe(true);
          expect(part.mesh.indices.length % 3).toBe(0);
        }
      }
    }
    // Letters without a text (an app version before texts): the round initial plaque.
    const older = specFromParameters('RING', { elements: [{ elementCode: 'LETTERS' }] });
    expect(older.elements[0].code).toBe('INITIAL');
    expect(triangles(buildJewelry(older), 'metal')).toBeGreaterThan(triangles(ring({}), 'metal'));
    const name = specFromParameters('NECKLACE', { elements: [{ elementCode: 'LETTERS', text: 'dana!7', sizeMm: 8 }] });
    expect(name.elements[0].text).toBe('DANA');
    // Sizes stay within the sheet's range.
    expect(specFromParameters('RING', { elements: [{ elementCode: 'TREE_OF_LIFE', sizeMm: 3 }] }).elements[0].sizeMm).toBe(8);
  });

  it('dragging on the model: the point under the finger becomes the angle and the place across the band', () => {
    const spec = specFromParameters('RING', { size: { standard: 'IL', sizeCode: '54', bandWidthMm: 3 } });
    expect(placementFromPoint(spec, [0, 10, 0.4])).toEqual({ angleDeg: 90, offsetMm: 0.4 });
    expect(placementFromPoint(spec, [-10, 0, 9])).toEqual({ angleDeg: 180, offsetMm: 1.5 });
    expect(placementFromPoint(specFromParameters('NECKLACE', {}), [0, -100, 0]).angleDeg).toBe(270);
    expect(placementFromPoint(specFromParameters('EARRINGS', {}), [14, 0, 0])).toEqual({ angleDeg: 0, offsetMm: 3 });
  });

  it('a necklace pendant moves along the chain', () => {
    const at = (angleDeg: number) =>
      buildJewelry(specFromParameters('NECKLACE', { stones: [{ stoneCode: 'CITRINE', placement: { angleDeg } }] }));
    const [bx, by] = centroid(stoneParts(at(270))[0].mesh.positions);
    expect(by).toBeLessThan(-70);
    expect(Math.abs(bx)).toBeLessThan(5);
    expect(centroid(stoneParts(at(0))[0].mesh.positions)[0]).toBeGreaterThan(60);
  });

  it('the second stone of a stud earring rings the centre stone until the user moves it, then goes where it is put', () => {
    const stud = (second: Record<string, unknown>) =>
      buildJewelry(
        specFromParameters('EARRINGS', { size: { earringStyleCode: 'stud' }, stones: [{ stoneCode: 'DIAMOND' }, { stoneCode: 'RUBY', ...second }] }),
      );
    const halo = stud({});
    const moved = stud({ placement: { angleDeg: 90, offsetMm: 8 } });
    const ruby = (model: JewelryModel) => model.parts.find((p) => p.material === 'stone' && p.code === 'RUBY')!;
    // The halo is many small stones; the moved one is a single stone in its own bezel, 8 mm above.
    expect(ruby(halo).mesh.indices.length).toBeGreaterThan(ruby(moved).mesh.indices.length * 4);
    const rightEarring = (positions: number[]) => {
      const right: number[] = [];
      for (let i = 0; i < positions.length; i += 3) if (positions[i] > 0) right.push(positions[i], positions[i + 1], positions[i + 2]);
      return centroid(right);
    };
    const [x, y] = rightEarring(ruby(moved).mesh.positions);
    expect(x).toBeCloseTo(11, 0);
    expect(y).toBeCloseTo(8, 0);
  });

  it('the studio is told how each item moves, the way the geometry places it', () => {
    const ringPiece = { stones: 2, centreHead: true };
    expect(placementControls('RING', 'STONE', 0, ringPiece)).toEqual({ angle: true, across: null, rotation: true });
    expect(placementControls('RING', 'STONE', 1, ringPiece)).toEqual({ angle: true, across: 'BAND', rotation: true });
    expect(placementControls('RING', 'STONE', 0, { stones: 1, centreHead: false }).across).toBe('BAND');
    expect(placementControls('RING', 'ELEMENT', 0, ringPiece).across).toBe('BAND');
    expect(placementControls('NECKLACE', 'ELEMENT', 2, ringPiece)).toEqual({ angle: true, across: null, rotation: true });
    expect(placementControls('BRACELET', 'STONE', 0, ringPiece).angle).toBe(true);
    // Earrings: the centre stays; further items go around it.
    expect(placementControls('EARRINGS', 'STONE', 0, { stones: 1, centreHead: true }).angle).toBe(false);
    expect(placementControls('EARRINGS', 'STONE', 1, { stones: 2, centreHead: true }).across).toBe('DISTANCE');
    expect(placementControls('EARRINGS', 'ELEMENT', 0, { stones: 0, centreHead: false }).angle).toBe(false);
    expect(placementControls('EARRINGS', 'ELEMENT', 0, { stones: 1, centreHead: true }).angle).toBe(true);
    expect(placementControls('EARRINGS', 'ELEMENT', 0, { stones: 1, centreHead: true, earringStyle: 'drop' }).angle).toBe(false);
    expect(placementControls('EARRINGS', 'ELEMENT', 1, { stones: 1, centreHead: true, earringStyle: 'drop' }).across).toBe('DISTANCE');
  });
});
