import { ELEMENTS, elementDef } from './catalog';
import { motifOutline, motifShape, traceRegion, triangulate, P2 } from './motifs';

const area = (pts: P2[]) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
};

const triArea = (pts: P2[], tris: number[]) => {
  let total = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [pts[tris[i]], pts[tris[i + 1]], pts[tris[i + 2]]];
    total += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  return total;
};

describe('triangulation', () => {
  it('covers a polygon with holes exactly', () => {
    const outer: P2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const hole: P2[] = [[3, 3], [3, 6], [6, 6], [6, 3]];
    const tris = triangulate(outer, [hole]);
    expect(triArea([...outer, ...hole], tris)).toBeCloseTo(100 - 9, 6);
  });

  it('a concave outline (a star) is covered without spilling outside', () => {
    const star: P2[] = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? 5 : 2;
      star.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const tris = triangulate(star, []);
    expect(tris.length / 3).toBe(8);
    expect(triArea(star, tris)).toBeCloseTo(Math.abs(area(star)), 6);
  });
});

describe('outlines', () => {
  it('a ring (disc with a hole) traces as one outline and one hole', () => {
    const sdf = (x: number, y: number) => Math.abs(Math.hypot(x, y) - 4) - 1;
    const region = traceRegion(sdf, [-5, -5], [5, 5], 0.1);
    expect(region.shapes).toHaveLength(1);
    expect(region.shapes[0].holes).toHaveLength(1);
    expect(area(region.shapes[0].outer)).toBeGreaterThan(0);
    expect(area(region.shapes[0].holes[0])).toBeLessThan(0);
    const filled = Math.abs(area(region.shapes[0].outer)) - Math.abs(area(region.shapes[0].holes[0]));
    expect(filled).toBeCloseTo(Math.PI * (25 - 9), 0);
  });
});

describe('the elements of the client sheet', () => {
  it('every element, at its smallest and largest size, is one cast piece of about that size', () => {
    for (const def of ELEMENTS) {
      for (const size of [def.minMm, def.maxMm]) {
        const text = def.code === 'LETTERS' ? 'א' : def.code === 'NUMBERS' ? '7' : '';
        const outline = motifOutline(def, size, text, def.variants[0] ?? '');
        // One piece: all parts touch (letters and digits joined, the paw's pads, the pair of wings).
        expect({ code: def.code, size, pieces: outline.shape.shapes.length }).toEqual({ code: def.code, size, pieces: 1 });
        const span = Math.max(outline.shape.max[0] - outline.shape.min[0], outline.shape.max[1] - outline.shape.min[1]);
        expect(span).toBeGreaterThan(size * 0.7);
        expect(span).toBeLessThan(size * 1.25 + def.minWallMm);
        expect(outline.thicknessMm).toBeGreaterThanOrEqual(1);
        expect(outline.thicknessMm).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('no stroke is thinner than the minimum wall, even at the smallest size (the butterfly\'s body 0.9 mm)', () => {
    for (const def of ELEMENTS) {
      for (const variant of def.variants.length ? def.variants : ['']) {
        const text = def.code === 'LETTERS' ? 'AבZ' : def.code === 'NUMBERS' ? '2026' : '';
        const shape = motifShape(def, def.minMm, text, variant);
        expect({ code: def.code, variant, ok: shape.thinnestStrokeMm >= def.minWallMm - 1e-9 }).toEqual({ code: def.code, variant, ok: true });
      }
    }
    const butterfly = motifShape(elementDef('BUTTERFLY')!, 4);
    expect(butterfly.sdf(0, 0)).toBeLessThanOrEqual(-0.45 + 1e-9);
  });

  it('the narrow parts stay solid: the crescent tips 0.8 mm, the horseshoe ends 0.9 mm, at the smallest size', () => {
    const tip = (cx: number, cy: number, rx: number, ry: number, deg: number): [number, number] => [
      cx + Math.cos((deg * Math.PI) / 180) * rx,
      cy + Math.sin((deg * Math.PI) / 180) * ry,
    ];
    const moon = motifShape(elementDef('CRESCENT_MOON')!, 4);
    for (const deg of [65, 295]) {
      const [x, y] = tip(0.08 * 4, 0, 0.42 * 4, 0.46 * 4, deg);
      expect(moon.sdf(x, y)).toBeLessThanOrEqual(-0.4 + 1e-6);
    }
    const shoe = motifShape(elementDef('HORSESHOE')!, 4);
    for (const deg of [-55, 235]) {
      const [x, y] = tip(0, 0.04 * 4, 0.36 * 4, 0.4 * 4, deg);
      expect(shoe.sdf(x, y)).toBeLessThanOrEqual(-0.45 + 1e-6);
    }
  });

  it('the anchor loop never closes below 1.5 mm across', () => {
    const anchor = elementDef('ANCHOR')!;
    const outline = motifOutline(anchor, anchor.minMm);
    const hole = outline.shape.shapes[0].holes[0];
    const xs = hole.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(1.5 - 0.05);
  });

  it('the solid star of David is a 0.6 mm field in a raised frame; the openwork one is wires', () => {
    const star = elementDef('STAR_OF_DAVID')!;
    const solid = motifOutline(star, 12, '', 'SOLID');
    expect(solid.grooves).not.toBeNull();
    expect(solid.thicknessMm - solid.grooveDepthMm).toBeCloseTo(0.6, 6);
    const open = motifOutline(star, 12, '', 'OPENWORK');
    expect(open.grooves).toBeNull();
    expect(open.shape.shapes[0].holes.length).toBeGreaterThan(0);
  });

  it('engravings and ribs: the hamsa 0.3 mm deep, the shell no more than 0.2 mm', () => {
    expect(motifOutline(elementDef('HAMSA')!, 15).grooveDepthMm).toBe(0.3);
    expect(motifOutline(elementDef('SEASHELL')!, 10).grooveDepthMm).toBeLessThanOrEqual(0.2);
  });

  it('a name or a date is one piece, in Hebrew or English, and only letters / digits are kept', () => {
    const letters = elementDef('LETTERS')!;
    expect(motifOutline(letters, 6, 'דנה').shape.shapes).toHaveLength(1);
    expect(motifOutline(letters, 6, 'Dana').shape.shapes).toHaveLength(1);
    const date = motifOutline(elementDef('NUMBERS')!, 6, '2026');
    expect(date.shape.shapes).toHaveLength(1);
    // Four digits side by side: wider than tall.
    expect(date.shape.max[0] - date.shape.min[0]).toBeGreaterThan(3 * (date.shape.max[1] - date.shape.min[1]));
  });

  it('an outline is traced once per element, size, text and variant', () => {
    const letters = elementDef('LETTERS')!;
    expect(motifOutline(letters, 6, 'AB')).toBe(motifOutline(letters, 6, 'AB'));
    expect(motifOutline(letters, 6, 'AB')).not.toBe(motifOutline(letters, 6, 'AC'));
    expect(motifOutline(letters, 6, 'AB')).not.toBe(motifOutline(letters, 7, 'AB'));
    const star = elementDef('STAR_OF_DAVID')!;
    expect(motifOutline(star, 10, '', 'SOLID')).not.toBe(motifOutline(star, 10, '', 'OPENWORK'));
  });
});
