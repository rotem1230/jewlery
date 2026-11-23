import { ELEMENTS, SETTINGS, bandMetalThicknessMm, placementControls } from './catalog';
import { buildJewelry, dragPlacement, modelBounds, placementFromPoint, ringInnerDiameterMm, ringLayout, specFromParameters, JewelryModel } from './geometry';

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
    // The head and stone stand on top of the band (low, on the band itself: notes of 23.11).
    expect(max[1]).toBeGreaterThan(56 / Math.PI / 2 + spec.ring.bandThicknessMm + 1.5);
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

  it('a stone added beside a band setting stands in a basket on top unless the user chose no head', () => {
    const band = { settingCode: 'BAND_BEAD_BRIGHT_CUT', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1.5 };
    // A band style for small stones and no head chosen, then a sapphire added in the stone tab.
    const model = ring({ stones: [{ stoneCode: 'SAPPHIRE', sizeMm: 5 }], setting: { band } });
    expect(model.spec.setting).toBe('BASKET');
    const [x, y] = centroid(stoneParts(model).find((p) => p.code === 'SAPPHIRE')!.mesh.positions);
    expect(y).toBeGreaterThan(modelBounds(ring({})).max[0]);
    expect(Math.abs(x)).toBeLessThan(1);
    // The row of small stones still runs on both shoulders of the head.
    expect(stoneParts(model).some((p) => p.code === 'CRYSTAL')).toBe(true);
    // "No head" chosen on purpose: the stone is set flush in the band.
    expect(ring({ stones: [{ stoneCode: 'SAPPHIRE', sizeMm: 5 }], setting: { headCode: 'NONE', band } }).spec.setting).toBeNull();
    // An older pavé design (the setting itself was the band, made of the first stone): unchanged.
    const older = specFromParameters('RING', { stones: [{ stoneCode: 'RUBY' }, { stoneCode: 'SAPPHIRE' }], setting: { settingCode: 'PAVE' } });
    expect(older.setting).toBeNull();
    expect(older.band?.stoneCode).toBe('RUBY');
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

describe('the client notes of 23.11: the head on the band, shapes, elements by the head, shanks', () => {
  const params = (extra: Record<string, unknown> = {}, size: Record<string, unknown> = {}) => ({
    size: { standard: 'IL', sizeCode: '54', bandWidthMm: 3, ...size },
    ...extra,
  });
  const ring = (extra: Record<string, unknown> = {}, size: Record<string, unknown> = {}) =>
    buildJewelry(specFromParameters('RING', params(extra, size)));
  const radii = (positions: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < positions.length; i += 3) out.push(Math.hypot(positions[i], positions[i + 1]));
    return out;
  };
  const deg = (rad: number) => (rad * 180) / Math.PI;
  /** Band metal (not the head above it) within 3° of `angleDeg`: its triangles' z ranges. */
  const bandFaces = (model: JewelryModel, angleDeg: number) => {
    const { positions: p, indices } = model.parts.find((x) => x.material === 'metal')!.mesh;
    const { innerDiameterMm, bandThicknessMm } = model.spec.ring;
    const ro = innerDiameterMm / 2 + bandThicknessMm;
    const near = (v: number) => {
      const a = deg(Math.atan2(p[v * 3 + 1], p[v * 3]));
      return Math.abs(((a - angleDeg + 540) % 360) - 180) < 3 && Math.hypot(p[v * 3], p[v * 3 + 1]) <= ro + 0.05;
    };
    const faces: Array<[number, number]> = [];
    for (let i = 0; i < indices.length; i += 3) {
      const tri = [indices[i], indices[i + 1], indices[i + 2]];
      if (!tri.every(near)) continue;
      const zs = tri.map((v) => p[v * 3 + 2]);
      faces.push([Math.min(...zs), Math.max(...zs)]);
    }
    return faces;
  };
  /** Whether band metal covers the point `z` across the band at `angleDeg`. */
  const covers = (model: JewelryModel, angleDeg: number, z: number) => bandFaces(model, angleDeg).some(([lo, hi]) => lo <= z && z <= hi);
  /** How far across the band its metal reaches at `angleDeg` (either side). */
  const reach = (model: JewelryModel, angleDeg: number) => Math.max(...bandFaces(model, angleDeg).map(([lo, hi]) => Math.max(-lo, hi)));

  it('the centre stone sits on the band, not on legs above it, and never pokes into the finger', () => {
    for (const [sizeMm, bandWidthMm] of [[5.2, 3], [7.3, 2], [3, 1.5]]) {
      for (const headCode of ['BASKET', 'BEZEL', 'PEG_HEAD', 'TRELLIS']) {
        const model = ring({ stones: [{ stoneCode: 'DIAMOND', sizeMm }], setting: { headCode } }, { bandWidthMm });
        const { innerDiameterMm, bandThicknessMm } = model.spec.ring;
        const ri = innerDiameterMm / 2;
        const ro = ri + bandThicknessMm;
        const r = radii(model.parts.find((p) => p.material === 'stone')!.mesh.positions);
        const culet = Math.min(...r);
        const top = Math.max(...r);
        const label = `${headCode} ${sizeMm}mm on ${bandWidthMm}mm`;
        // The pavilion reaches down to the band: no gap (gallery / "legs") under the stone.
        expect({ label, onBand: culet <= ro + 0.05 }).toEqual({ label, onBand: true });
        expect({ label, insideRing: culet >= ri + 0.25 }).toEqual({ label, insideRing: true });
        // The table stands a little over the band (crown + part of the pavilion), not 3–4 mm up.
        expect({ label, low: top - ro <= sizeMm * 0.5 }).toEqual({ label, low: true });
      }
    }
  });

  it('a head chosen in the setting tab shows by itself, before any stone is added', () => {
    const none = ring({ setting: { headCode: 'NONE' } });
    for (const headCode of ['BASKET', 'BEZEL', 'HALF_BEZEL', 'ILLUSION']) {
      const model = ring({ setting: { headCode } });
      expect(model.spec.setting).toBe(headCode);
      expect(model.parts.filter((p) => p.material === 'stone')).toEqual([]);
      expect({ headCode, more: triangles(model, 'metal') > triangles(none, 'metal') + 50 }).toEqual({ headCode, more: true });
      // It stands on the top of the band.
      expect(modelBounds(model).max[1]).toBeGreaterThan(modelBounds(none).max[1] + 0.8);
    }
  });

  it('an element moved toward the head lies right against it, on the side it came from', () => {
    const spec = (angleDeg: number) =>
      specFromParameters(
        'RING',
        params({
          stones: [{ stoneCode: 'DIAMOND', sizeMm: 5.2 }],
          setting: { headCode: 'BASKET' },
          elements: [{ elementCode: 'HEART', sizeMm: 4, placement: { angleDeg } }],
        }),
      );
    for (const angleDeg of [93, 100]) {
      const layout = ringLayout(spec(angleDeg));
      const seat = layout.elements[0];
      const gapMm = (seat.angle - layout.headAngle!) * layout.outerRadiusMm - layout.headHalfMm - seat.halfMm;
      expect({ angleDeg, touching: gapMm >= -0.01 && gapMm <= 0.15 }).toEqual({ angleDeg, touching: true });
    }
    // Further away it stays where it was put.
    expect(deg(ringLayout(spec(150)).elements[0].angle)).toBeCloseTo(150, 5);
    // From the other side, it stays on the other side.
    expect(deg(ringLayout(spec(87)).elements[0].angle)).toBeLessThan(90);
  });

  it('a double / triple shank is two / three bands side by side, joined under the head', () => {
    const width = (model: JewelryModel) => {
      const b = modelBounds(model);
      return b.max[2] - b.min[2];
    };
    const single = ring({}, { bandWidthMm: 2 });
    const double = ring({}, { bandWidthMm: 2, shankStyle: 'DOUBLE' });
    const triple = ring({}, { bandWidthMm: 2, shankStyle: 'TRIPLE' });
    expect(double.spec.ring.shankStyle).toBe('DOUBLE');
    expect(single.spec.ring.shankStyle).toBe('SINGLE');
    expect(width(double)).toBeGreaterThan(2 * 2 + 0.7);
    expect(width(triple)).toBeGreaterThan(width(double) + 2);
    expect(width(single)).toBeLessThan(2.1);
    // At the bottom of a double shank: metal on both bands, a gap between them.
    expect(covers(double, 270, 1.5)).toBe(true);
    expect(covers(double, 270, -1.5)).toBe(true);
    expect(covers(double, 270, 0)).toBe(false);
    expect(covers(single, 270, 0)).toBe(true);
    // Under the head the bands are joined.
    const headed = ring({ stones: [{ stoneCode: 'DIAMOND', sizeMm: 5.2 }], setting: { headCode: 'BASKET' } }, { bandWidthMm: 2, shankStyle: 'DOUBLE' });
    expect(covers(headed, 90, 0)).toBe(true);
    // A band of stones runs on every shank.
    const set = ring({ setting: { headCode: 'NONE', band: { settingCode: 'BAND_CHANNEL', stoneCode: 'DIAMOND', stoneSizeMm: 1.5, count: 4 } } }, { bandWidthMm: 2.5, shankStyle: 'DOUBLE' });
    const stoneZ = set.parts.find((p) => p.material === 'stone')!.mesh.positions.filter((_, i) => i % 3 === 2);
    expect(stoneZ.some((z) => z > 1) && stoneZ.some((z) => z < -1)).toBe(true);
  });

  it('a split shank opens into two arms toward the top and is one band at the bottom', () => {
    const stone = { stones: [{ stoneCode: 'DIAMOND', sizeMm: 5.2 }], setting: { headCode: 'BASKET' } };
    const split = ring(stone, { bandWidthMm: 3, shankStyle: 'SPLIT' });
    const plain = ring(stone, { bandWidthMm: 3 });
    // Shoulder (40° from the top): two arms with an opening between them, spread wider than the band.
    expect(covers(split, 50, 0)).toBe(false);
    expect(covers(plain, 50, 0)).toBe(true);
    expect(covers(split, 50, 1.5)).toBe(true);
    expect(covers(split, 50, -1.5)).toBe(true);
    expect(reach(split, 50)).toBeGreaterThan(1.5 + 0.3);
    // Bottom: one band, as wide as chosen.
    expect(covers(split, 270, 0)).toBe(true);
    expect(reach(split, 270)).toBeCloseTo(1.5, 1);
  });

  it('a split shank sets no row of stones, also for an older design whose setting is the band itself', () => {
    const legacy = ring({ setting: { settingCode: 'PAVE' } }, { bandWidthMm: 3, shankStyle: 'SPLIT' });
    expect(legacy.parts.some((p) => p.material === 'stone')).toBe(false);
    const single = ring({ setting: { settingCode: 'PAVE' } }, { bandWidthMm: 3 });
    expect(single.parts.some((p) => p.material === 'stone')).toBe(true);
  });

  it('dragging an element across the head keeps it against the head, on the side it came from', () => {
    const spec = specFromParameters(
      'RING',
      params({
        stones: [{ stoneCode: 'DIAMOND', sizeMm: 5.2 }],
        setting: { headCode: 'BASKET' },
        elements: [{ elementCode: 'HEART', sizeMm: 4, placement: { angleDeg: 120 } }],
      }),
    );
    const layout = ringLayout(spec);
    const zone = deg((layout.headHalfMm + layout.elements[0].halfMm) / layout.outerRadiusMm);
    const top = (angleDeg: number): [number, number, number] => [Math.cos((angleDeg * Math.PI) / 180) * 12, Math.sin((angleDeg * Math.PI) / 180) * 12, 0];
    // Coming from 120° (one side), the finger passes the head's middle (88°): it stays on its side.
    expect(dragPlacement(spec, { kind: 'element', index: 0 }, top(88), 120).angleDeg).toBeCloseTo(90 + zone, 0);
    // From the other side (60°), the same point keeps it on that side.
    expect(dragPlacement(spec, { kind: 'element', index: 0 }, top(92), 60).angleDeg).toBeCloseTo(90 - zone, 0);
    // Away from the head the finger decides, as before.
    expect(dragPlacement(spec, { kind: 'element', index: 0 }, top(200), 120).angleDeg).toBeCloseTo(200, 5);
    // A stone is placed where the finger is.
    expect(dragPlacement(spec, { kind: 'stone', index: 1 }, top(88), 120).angleDeg).toBeCloseTo(88, 5);
  });

  it('every fancy shape builds a stone of its own proportions', () => {
    const extent = (model: JewelryModel) => {
      const p = model.parts.find((x) => x.material === 'stone')!.mesh.positions;
      const xs = p.filter((_, i) => i % 3 === 0);
      const zs = p.filter((_, i) => i % 3 === 2);
      return { along: Math.max(...xs) - Math.min(...xs), across: Math.max(...zs) - Math.min(...zs) };
    };
    const shapes: Record<string, number> = { PRINCESS: 1, ASSCHER: 1, CUSHION: 0.95, RADIANT: 0.8, PEAR: 0.62, MARQUISE: 0.5, HEART: 1, BAGUETTE: 0.35, TRILLION: 0.87 };
    for (const [cutCode, ratio] of Object.entries(shapes)) {
      const model = ring({ stones: [{ stoneCode: 'SAPPHIRE', cutCode, sizeMm: 7 }], setting: { headCode: 'BASKET' } }, { bandWidthMm: 4 });
      expect(model.spec.stones[0].shape).toBe(cutCode);
      const e = extent(model);
      expect({ cutCode, along: Math.round(e.along) }).toEqual({ cutCode, along: 7 });
      expect({ cutCode, ratio: Math.abs(e.across / e.along - ratio) < 0.08 }).toEqual({ cutCode, ratio: true });
      for (const part of model.parts) expect(part.mesh.positions.every(Number.isFinite)).toBe(true);
    }
  });

  it('dragging across a double shank reaches its outer band', () => {
    const spec = specFromParameters('RING', params({}, { bandWidthMm: 2, shankStyle: 'DOUBLE' }));
    expect(placementFromPoint(spec, [0, -10, 2.4]).offsetMm).toBeCloseTo(2.4, 5);
  });
});
