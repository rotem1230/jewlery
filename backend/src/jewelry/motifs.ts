/**
 * Flat decorative elements (motifs, letters and numbers) as 2D shapes: each element is a signed
 * distance field built from circles, capsules and polygons whose thinnest strokes are never below
 * the element's minimum wall thickness (the client's spec), traced into outlines (marching
 * squares) and triangulated (ear clipping) for the 3D geometry to extrude.
 *
 * Shapes are made at their real size in millimetres, so a thin part is thickened as the element
 * gets smaller, as the spec asks ("the wings' meeting point is thickened to 0.9 mm"…). Parts that
 * touch are one solid (the distance field is their union), so letters, digits, a paw print or a
 * pair of wings come out as one cast piece.
 *
 * This file must stay free of imports other than the catalogue: it is embedded in the studio's
 * WebView with the geometry.
 */

import { DIGITS, ElementDef, HEBREW_LETTERS, elementText } from './catalog';

export type P2 = [number, number];
/** Signed distance (mm): negative inside the shape. */
export type Sdf = (x: number, y: number) => number;

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------------------------
// Distance-field primitives
// ---------------------------------------------------------------------------------------------

interface Prim {
  /** Bounding box (mm), for skipping far primitives. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  d: Sdf;
}

/** While a motif is built: the thinnest stroke (radius) it is made of, holes and grooves aside. */
let strokeLog: { min: number } | null = null;
function logStroke(r: number): void {
  if (strokeLog) strokeLog.min = Math.min(strokeLog.min, r);
}
/** Builds without logging strokes (holes, grooves: thin on purpose). */
function unlogged<T>(build: () => T): T {
  const saved = strokeLog;
  strokeLog = null;
  try {
    return build();
  } finally {
    strokeLog = saved;
  }
}

function circlePrim(cx: number, cy: number, r: number): Prim {
  logStroke(r);
  return { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r, d: (x, y) => Math.hypot(x - cx, y - cy) - r };
}

/** A segment with a radius that runs from `ra` at a to `rb` at b. */
function capsulePrim(a: P2, b: P2, ra: number, rb = ra): Prim {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1e-12;
  const r = Math.max(ra, rb);
  logStroke(Math.min(ra, rb));
  return {
    x0: Math.min(a[0], b[0]) - r,
    y0: Math.min(a[1], b[1]) - r,
    x1: Math.max(a[0], b[0]) + r,
    y1: Math.max(a[1], b[1]) + r,
    d: (x, y) => {
      const t = clampNumber(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1);
      return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) - (ra + (rb - ra) * t);
    },
  };
}

/** Exact signed distance to a simple polygon (any winding). */
function polygonPrim(points: P2[]): Prim {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  points.forEach(([x, y]) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  });
  return {
    x0, y0, x1, y1,
    d: (x, y) => {
      let best = Infinity;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[j];
        const [bx, by] = points[i];
        const ex = bx - ax;
        const ey = by - ay;
        const t = clampNumber(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-12), 0, 1);
        best = Math.min(best, Math.hypot(x - ax - ex * t, y - ay - ey * t));
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      }
      return inside ? -best : best;
    },
  };
}

/** An ellipse (approximate distance; exact outline), turned by `rotDeg`. */
function ellipsePrim(cx: number, cy: number, rx: number, ry: number, rotDeg = 0): Prim {
  const c = Math.cos((rotDeg * Math.PI) / 180);
  const s = Math.sin((rotDeg * Math.PI) / 180);
  const r = Math.max(rx, ry);
  const m = Math.min(rx, ry);
  return {
    x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r,
    d: (x, y) => {
      const u = (x - cx) * c + (y - cy) * s;
      const v = -(x - cx) * s + (y - cy) * c;
      return (Math.hypot(u / rx, v / ry) - 1) * m;
    },
  };
}

/** A rectangle centred on (cx, cy) with rounded corners. */
function boxPrim(cx: number, cy: number, hw: number, hh: number, radius = 0, rotDeg = 0): Prim {
  const c = Math.cos((rotDeg * Math.PI) / 180);
  const s = Math.sin((rotDeg * Math.PI) / 180);
  const r = Math.hypot(hw, hh);
  return {
    x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r,
    d: (x, y) => {
      const u = Math.abs((x - cx) * c + (y - cy) * s) - (hw - radius);
      const v = Math.abs(-(x - cx) * s + (y - cy) * c) - (hh - radius);
      return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - radius;
    },
  };
}

/** The union of primitives; far ones are skipped by their bounding boxes. */
function unionPrims(prims: Prim[]): Sdf {
  return (x, y) => {
    let best = Infinity;
    for (const p of prims) {
      const dx = Math.max(p.x0 - x, 0, x - p.x1);
      const dy = Math.max(p.y0 - y, 0, y - p.y1);
      // Outside its box a prim is at least that far away; inside it, it may be deeper than `best`.
      const outside = Math.hypot(dx, dy);
      if (outside > 0 && outside >= best) continue;
      const d = p.d(x, y);
      if (d < best) best = d;
    }
    return best;
  };
}

function subtract(a: Sdf, b: Sdf): Sdf {
  return (x, y) => Math.max(a(x, y), -b(x, y));
}

function intersect(a: Sdf, b: Sdf): Sdf {
  return (x, y) => Math.max(a(x, y), b(x, y));
}

/** Capsules along a polyline, radius `r` (or per-point radii). */
function strokePrims(points: P2[], r: number | number[]): Prim[] {
  const radius = (i: number) => (Array.isArray(r) ? r[i] : r);
  if (points.length === 1) return [circlePrim(points[0][0], points[0][1], radius(0))];
  const prims: Prim[] = [];
  for (let i = 0; i < points.length - 1; i++) prims.push(capsulePrim(points[i], points[i + 1], radius(i), radius(i + 1)));
  return prims;
}

/** Points on an elliptic arc, angles in degrees (a1 < a0 runs clockwise). */
function arcPoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps = 0): P2[] {
  const n = steps || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 12));
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Rounds every corner of a polygon with an arc of `radius` (limited by the edge lengths). */
function roundCorners(points: P2[], radius: number): P2[] {
  if (radius <= 0) return points;
  const out: P2[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const ua: P2 = [a[0] - p[0], a[1] - p[1]];
    const ub: P2 = [b[0] - p[0], b[1] - p[1]];
    const la = Math.hypot(ua[0], ua[1]) || 1;
    const lb = Math.hypot(ub[0], ub[1]) || 1;
    ua[0] /= la; ua[1] /= la; ub[0] /= lb; ub[1] /= lb;
    const cos = clampNumber(ua[0] * ub[0] + ua[1] * ub[1], -1, 1);
    const half = Math.acos(cos) / 2;
    if (half < 1e-3 || half > Math.PI / 2 - 1e-3) {
      out.push(p);
      continue;
    }
    const cut = Math.min(radius / Math.tan(half), la * 0.45, lb * 0.45);
    const r = cut * Math.tan(half);
    const s: P2 = [p[0] + ua[0] * cut, p[1] + ua[1] * cut];
    const e: P2 = [p[0] + ub[0] * cut, p[1] + ub[1] * cut];
    const bis: P2 = [ua[0] + ub[0], ua[1] + ub[1]];
    const bl = Math.hypot(bis[0], bis[1]) || 1;
    const dist = r / Math.sin(half);
    const c: P2 = [p[0] + (bis[0] / bl) * dist, p[1] + (bis[1] / bl) * dist];
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    const a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const steps = 4;
    for (let k = 0; k <= steps; k++) {
      const t = a0 + (delta * k) / steps;
      out.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]);
    }
  }
  return out;
}

function scalePoints(points: P2[], k: number, dx = 0, dy = 0): P2[] {
  return points.map(([x, y]) => [x * k + dx, y * k + dy]);
}

function rotatePoints(points: P2[], deg: number, cx = 0, cy = 0): P2[] {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return points.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

function mirrorX(points: P2[]): P2[] {
  return points.map(([x, y]) => [-x, y]).reverse() as P2[];
}

// ---------------------------------------------------------------------------------------------
// Outlines: marching squares
// ---------------------------------------------------------------------------------------------

export interface Loop {
  points: P2[];
  /** Signed area: > 0 counter-clockwise. */
  area: number;
}

export interface Region {
  /** Outer outlines (counter-clockwise), each with the holes inside it (clockwise). */
  shapes: Array<{ outer: P2[]; holes: P2[][] }>;
  min: P2;
  max: P2;
}

function signedArea(points: P2[]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  return a / 2;
}

function pointInPolygon(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    if (ay > p[1] !== by > p[1] && p[0] < ((bx - ax) * (p[1] - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Douglas–Peucker: keeps the points of an open run that deviate more than `tol` from its chords. */
function simplifyRun(points: P2[], tol: number): P2[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = points[s];
    const b = points[e];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l = Math.hypot(ex, ey);
    let worst = -1;
    let at = -1;
    for (let i = s + 1; i < e; i++) {
      const p = points[i];
      const dev = l > 1e-12 ? Math.abs((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / l : Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (dev > worst) {
        worst = dev;
        at = i;
      }
    }
    if (worst > tol && at > 0) {
      keep[at] = 1;
      stack.push([s, at], [at, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplifies a closed outline: split at the point farthest from the first, each half simplified. */
function simplifyLoop(points: P2[], tol: number): P2[] {
  if (points.length < 8) return points;
  let far = 0;
  let best = -1;
  points.forEach((p, i) => {
    const d = Math.hypot(p[0] - points[0][0], p[1] - points[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  });
  const first = simplifyRun(points.slice(0, far + 1), tol);
  const second = simplifyRun([...points.slice(far), points[0]], tol);
  const out = [...first.slice(0, -1), ...second.slice(0, -1)];
  return out.length >= 3 ? out : points;
}

/** Splits segments longer than `maxLen` (for outlines that are bent onto a ring band). */
export function densifyLoop(points: P2[], maxLen: number): P2[] {
  if (!(maxLen > 0)) return points;
  const out: P2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push(a);
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen);
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / (n + 1), a[1] + ((b[1] - a[1]) * k) / (n + 1)]);
  }
  return out;
}

/**
 * Traces the shape's outlines on a grid of `step` mm over the box (which must enclose it), and
 * groups them into outer outlines with their holes.
 */
export function traceRegion(sdf: Sdf, min: P2, max: P2, step: number): Region {
  const pad = step * 2;
  const x0 = min[0] - pad;
  const y0 = min[1] - pad;
  const nx = Math.ceil((max[0] - min[0] + 2 * pad) / step) + 1;
  const ny = Math.ceil((max[1] - min[1] + 2 * pad) / step) + 1;
  const v = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const d = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 ? 1 : sdf(x0 + i * step, y0 + j * step);
      // Exactly zero would make a vertex on a grid point: nudge it outside.
      v[j * nx + i] = d === 0 ? 1e-9 : d;
    }
  }
  const at = (i: number, j: number) => v[j * nx + i];
  const point = (i0: number, j0: number, i1: number, j1: number): P2 => {
    const a = at(i0, j0);
    const b = at(i1, j1);
    const t = a / (a - b);
    return [x0 + (i0 + (i1 - i0) * t) * step, y0 + (j0 + (j1 - j0) * t) * step];
  };
  // Edge keys: horizontal edge (i, j)-(i+1, j) = "h", vertical (i, j)-(i, j+1) = "v".
  const segments = new Map<string, string[]>();
  const points = new Map<string, P2>();
  const link = (a: string, b: string) => {
    (segments.get(a) ?? segments.set(a, []).get(a)!).push(b);
    (segments.get(b) ?? segments.set(b, []).get(b)!).push(a);
  };
  const edge = (kind: 'h' | 'v', i: number, j: number): string => {
    const key = `${kind}${i},${j}`;
    if (!points.has(key)) points.set(key, kind === 'h' ? point(i, j, i + 1, j) : point(i, j, i, j + 1));
    return key;
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = at(i, j) < 0 ? 1 : 0; // bottom-left
      const b = at(i + 1, j) < 0 ? 2 : 0; // bottom-right
      const c = at(i + 1, j + 1) < 0 ? 4 : 0; // top-right
      const d = at(i, j + 1) < 0 ? 8 : 0; // top-left
      const kase = a | b | c | d;
      if (kase === 0 || kase === 15) continue;
      const bottom = () => edge('h', i, j);
      const right = () => edge('v', i + 1, j);
      const top = () => edge('h', i, j + 1);
      const left = () => edge('v', i, j);
      const centreInside = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 < 0;
      switch (kase) {
        case 1: case 14: link(left(), bottom()); break;
        case 2: case 13: link(bottom(), right()); break;
        case 3: case 12: link(left(), right()); break;
        case 4: case 11: link(right(), top()); break;
        case 6: case 9: link(bottom(), top()); break;
        case 7: case 8: link(left(), top()); break;
        case 5:
          if (centreInside) { link(left(), top()); link(bottom(), right()); }
          else { link(left(), bottom()); link(right(), top()); }
          break;
        case 10:
          if (centreInside) { link(left(), bottom()); link(right(), top()); }
          else { link(left(), top()); link(bottom(), right()); }
          break;
      }
    }
  }
  // Follow the links into closed loops.
  const used = new Set<string>();
  const loops: Loop[] = [];
  const tol = step * 0.08;
  segments.forEach((_, start) => {
    if (used.has(start)) return;
    const keys: string[] = [start];
    used.add(start);
    let prev = '';
    let cur = start;
    for (;;) {
      const next = (segments.get(cur) ?? []).find((k) => k !== prev && !used.has(k));
      if (!next) break;
      used.add(next);
      keys.push(next);
      prev = cur;
      cur = next;
    }
    if (keys.length < 3) return;
    const pts = simplifyLoop(keys.map((k) => points.get(k)!), tol);
    if (pts.length < 3) return;
    loops.push({ points: pts, area: signedArea(pts) });
  });
  // Nesting: a loop inside an even number of others is an outer outline.
  const ordered = loops.filter((l) => Math.abs(l.area) > step * step * 0.5).sort((p, q) => Math.abs(q.area) - Math.abs(p.area));
  const depth = ordered.map((l, k) => ordered.filter((o, m) => m !== k && Math.abs(o.area) > Math.abs(l.area) && pointInPolygon(l.points[0], o.points)).length);
  const shapes: Region['shapes'] = [];
  const outers: number[] = [];
  ordered.forEach((l, k) => {
    if (depth[k] % 2 === 0) {
      shapes.push({ outer: l.area > 0 ? l.points : l.points.slice().reverse(), holes: [] });
      outers.push(k);
    }
  });
  ordered.forEach((l, k) => {
    if (depth[k] % 2 === 0) return;
    // The smallest outer outline around the hole.
    let best = -1;
    outers.forEach((o, s) => {
      if (pointInPolygon(l.points[0], ordered[o].points) && (best < 0 || Math.abs(ordered[o].area) < Math.abs(ordered[outers[best]].area))) best = s;
    });
    if (best >= 0) shapes[best].holes.push(l.area < 0 ? l.points : l.points.slice().reverse());
  });
  let mnx = Infinity;
  let mny = Infinity;
  let mxx = -Infinity;
  let mxy = -Infinity;
  shapes.forEach((s) =>
    s.outer.forEach(([x, y]) => {
      mnx = Math.min(mnx, x);
      mny = Math.min(mny, y);
      mxx = Math.max(mxx, x);
      mxy = Math.max(mxy, y);
    }),
  );
  return { shapes, min: [mnx, mny], max: [mxx, mxy] };
}

// ---------------------------------------------------------------------------------------------
// Triangulation (ear clipping with holes, after Mapbox's earcut)
// ---------------------------------------------------------------------------------------------

interface ENode {
  i: number;
  x: number;
  y: number;
  prev: ENode;
  next: ENode;
  steiner: boolean;
}

function eNode(i: number, x: number, y: number): ENode {
  const n = { i, x, y, steiner: false } as ENode;
  n.prev = n;
  n.next = n;
  return n;
}

function insertNode(i: number, x: number, y: number, last: ENode | null): ENode {
  const p = eNode(i, x, y);
  if (!last) return p;
  p.next = last.next;
  p.prev = last;
  last.next.prev = p;
  last.next = p;
  return p;
}

function removeNode(p: ENode): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
}

function triArea(p: ENode, q: ENode, r: ENode): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function equals(p: ENode, q: ENode): boolean {
  return p.x === q.x && p.y === q.y;
}

function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

function linkedList(coords: number[], start: number, end: number, clockwise: boolean): ENode | null {
  let sum = 0;
  for (let i = start, j = end - 2; i < end; i += 2) {
    sum += (coords[j] - coords[i]) * (coords[i + 1] + coords[j + 1]);
    j = i;
  }
  let last: ENode | null = null;
  if (clockwise === sum > 0) {
    for (let i = start; i < end; i += 2) last = insertNode(i / 2, coords[i], coords[i + 1], last);
  } else {
    for (let i = end - 2; i >= start; i -= 2) last = insertNode(i / 2, coords[i], coords[i + 1], last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}

function filterPoints(start: ENode | null, end?: ENode | null): ENode | null {
  if (!start) return start;
  if (!end) end = start;
  let p = start;
  let again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || triArea(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);
  return end;
}

function isEar(ear: ENode): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (triArea(a, b, c) >= 0) return false;
  let p = ear.next.next;
  while (p !== ear.prev) {
    if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && triArea(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}

function intersects(p1: ENode, q1: ENode, p2: ENode, q2: ENode): boolean {
  const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const onSeg = (p: ENode, q: ENode, r: ENode) =>
    q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  const o1 = sign(triArea(p1, q1, p2));
  const o2 = sign(triArea(p1, q1, q2));
  const o3 = sign(triArea(p2, q2, p1));
  const o4 = sign(triArea(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p2, q1)) return true;
  if (o2 === 0 && onSeg(p1, q2, q1)) return true;
  if (o3 === 0 && onSeg(p2, p1, q2)) return true;
  if (o4 === 0 && onSeg(p2, q1, q2)) return true;
  return false;
}

function locallyInside(a: ENode, b: ENode): boolean {
  return triArea(a.prev, a, a.next) < 0 ? triArea(a, b, a.next) >= 0 && triArea(a, a.prev, b) >= 0 : triArea(a, b, a.prev) < 0 || triArea(a, a.next, b) < 0;
}

function cureLocalIntersections(start: ENode, triangles: number[]): ENode {
  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i, p.i, b.i);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p) ?? p;
}

function intersectsPolygon(a: ENode, b: ENode): boolean {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

function middleInside(a: ENode, b: ENode): boolean {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}

function isValidDiagonal(a: ENode, b: ENode): boolean {
  return (
    a.next.i !== b.i &&
    a.prev.i !== b.i &&
    !intersectsPolygon(a, b) &&
    ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (triArea(a.prev, a, b.prev) !== 0 || triArea(a, b.prev, b) !== 0)) ||
      (equals(a, b) && triArea(a.prev, a, a.next) > 0 && triArea(b.prev, b, b.next) > 0))
  );
}

function splitPolygon(a: ENode, b: ENode): ENode {
  const a2 = eNode(a.i, a.x, a.y);
  const b2 = eNode(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}

function splitEarcut(start: ENode, triangles: number[]): void {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        const c = splitPolygon(a, b);
        const fa = filterPoints(a, a.next);
        const fc = filterPoints(c, c.next);
        if (fa) earcutLinked(fa, triangles, 0);
        if (fc) earcutLinked(fc, triangles, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

function earcutLinked(ear: ENode | null, triangles: number[], pass: number): void {
  if (!ear) return;
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev: ENode = ear.prev;
    const next: ENode = ear.next;
    if (isEar(ear)) {
      triangles.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (!pass) earcutLinked(filterPoints(ear), triangles, 1);
      else if (pass === 1) earcutLinked(cureLocalIntersections(filterPoints(ear) ?? ear, triangles), triangles, 2);
      else if (pass === 2) splitEarcut(ear, triangles);
      break;
    }
  }
}

function findHoleBridge(hole: ENode, outerNode: ENode): ENode | null {
  let p = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m: ENode | null = null;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) return null;
  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && triArea(m.prev, m, p.prev) < 0 && triArea(p.next, m, m.next) < 0))))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}

function eliminateHoles(coords: number[], holeIndices: number[], outerNode: ENode): ENode {
  const queue: ENode[] = [];
  for (let i = 0; i < holeIndices.length; i++) {
    const start = holeIndices[i] * 2;
    const end = i < holeIndices.length - 1 ? holeIndices[i + 1] * 2 : coords.length;
    const list = linkedList(coords, start, end, false);
    if (!list) continue;
    if (list === list.next) list.steiner = true;
    let leftmost = list;
    let p = list;
    do {
      if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
      p = p.next;
    } while (p !== list);
    queue.push(leftmost);
  }
  queue.sort((a, b) => a.x - b.x);
  for (const hole of queue) {
    const bridge = findHoleBridge(hole, outerNode);
    if (!bridge) continue;
    const bridgeReverse = splitPolygon(bridge, hole);
    filterPoints(bridgeReverse, bridgeReverse.next);
    outerNode = filterPoints(bridge, bridge.next) ?? outerNode;
  }
  return outerNode;
}

/** Triangles (indices into the outline points, outer first then the holes in order) of a shape with holes. */
export function triangulate(outer: P2[], holes: P2[][]): number[] {
  const coords: number[] = [];
  const holeIndices: number[] = [];
  outer.forEach(([x, y]) => coords.push(x, y));
  holes.forEach((h) => {
    holeIndices.push(coords.length / 2);
    h.forEach(([x, y]) => coords.push(x, y));
  });
  let outerNode = linkedList(coords, 0, holeIndices.length ? holeIndices[0] * 2 : coords.length, true);
  const triangles: number[] = [];
  if (!outerNode || outerNode.next === outerNode.prev) return triangles;
  if (holeIndices.length) outerNode = eliminateHoles(coords, holeIndices, outerNode);
  earcutLinked(outerNode, triangles, 0);
  return triangles;
}

// ---------------------------------------------------------------------------------------------
// Block font (sans, no thin strokes): letters A–Z, Hebrew א–ת, digits 0–9
// ---------------------------------------------------------------------------------------------

/**
 * Glyphs as strokes in a box of height 1 (baseline 0): points "x,y", arcs "A:cx,cy,rx,ry,a0,a1"
 * (degrees), strokes separated by "|". Strokes are drawn with one radius, so no line is thinner
 * than the element's wall.
 */
const GLYPHS: Record<string, { w: number; s: string }> = {
  A: { w: 0.72, s: '0,0 0.36,1 0.72,0|0.14,0.38 0.58,0.38' },
  B: { w: 0.62, s: '0,0 0,1 0.32,1 A:0.32,0.75,0.25,0.25,90,-90 0,0.5|0.32,0.5 A:0.35,0.25,0.27,0.25,90,-90 0,0' },
  C: { w: 0.78, s: 'A:0.42,0.5,0.42,0.5,40,320' },
  D: { w: 0.68, s: '0,0 0,1 0.25,1 A:0.25,0.5,0.42,0.5,90,-90 0,0' },
  E: { w: 0.58, s: '0.58,1 0,1 0,0 0.58,0|0,0.5 0.46,0.5' },
  F: { w: 0.56, s: '0.56,1 0,1 0,0|0,0.5 0.46,0.5' },
  G: { w: 0.86, s: 'A:0.43,0.5,0.43,0.5,40,360 0.86,0.5 0.52,0.5' },
  H: { w: 0.66, s: '0,0 0,1|0.66,0 0.66,1|0,0.5 0.66,0.5' },
  I: { w: 0.1, s: '0.05,0 0.05,1' },
  J: { w: 0.52, s: '0.5,1 0.5,0.3 A:0.27,0.3,0.23,0.3,0,-180' },
  K: { w: 0.62, s: '0,0 0,1|0.6,1 0,0.4|0.18,0.56 0.62,0' },
  L: { w: 0.54, s: '0,1 0,0 0.54,0' },
  M: { w: 0.82, s: '0,0 0,1 0.41,0.32 0.82,1 0.82,0' },
  N: { w: 0.66, s: '0,0 0,1 0.66,0 0.66,1' },
  O: { w: 0.9, s: 'A:0.45,0.5,0.45,0.5,0,360' },
  P: { w: 0.6, s: '0,0 0,1 0.3,1 A:0.3,0.73,0.27,0.27,90,-90 0,0.46' },
  Q: { w: 0.92, s: 'A:0.45,0.5,0.45,0.5,0,360|0.56,0.26 0.92,-0.04' },
  R: { w: 0.62, s: '0,0 0,1 0.3,1 A:0.3,0.73,0.27,0.27,90,-90 0,0.46|0.28,0.46 0.62,0' },
  S: { w: 0.6, s: 'A:0.3,0.75,0.28,0.25,25,270 A:0.3,0.25,0.29,0.25,90,-155' },
  T: { w: 0.7, s: '0,1 0.7,1|0.35,1 0.35,0' },
  U: { w: 0.66, s: '0,1 0,0.35 A:0.33,0.35,0.33,0.35,180,360 0.66,1' },
  V: { w: 0.72, s: '0,1 0.36,0 0.72,1' },
  W: { w: 0.94, s: '0,1 0.23,0 0.47,0.68 0.71,0 0.94,1' },
  X: { w: 0.66, s: '0,1 0.66,0|0,0 0.66,1' },
  Y: { w: 0.7, s: '0,1 0.35,0.5 0.7,1|0.35,0.5 0.35,0' },
  Z: { w: 0.64, s: '0,1 0.64,1 0,0 0.64,0' },
  '0': { w: 0.6, s: 'A:0.3,0.5,0.3,0.5,0,360' },
  '1': { w: 0.36, s: '0,0.76 0.3,1 0.3,0' },
  '2': { w: 0.6, s: 'A:0.3,0.71,0.28,0.29,165,-35 0,0 0.6,0' },
  '3': { w: 0.58, s: 'A:0.29,0.76,0.26,0.24,150,-90 A:0.29,0.27,0.29,0.27,90,-150' },
  '4': { w: 0.64, s: '0.46,0 0.46,1 0,0.3 0.64,0.3' },
  '5': { w: 0.6, s: '0.56,1 0.08,1 0.05,0.58 A:0.3,0.32,0.3,0.32,125,-150' },
  '6': { w: 0.6, s: 'A:0.3,0.3,0.3,0.3,0,360|0.01,0.33 0.07,0.66 0.24,0.92 0.48,1' },
  '7': { w: 0.6, s: '0,1 0.6,1 0.2,0' },
  '8': { w: 0.6, s: 'A:0.3,0.76,0.24,0.24,0,360|A:0.3,0.27,0.29,0.27,0,360' },
  '9': { w: 0.6, s: 'A:0.3,0.7,0.3,0.3,0,360|0.59,0.67 0.53,0.34 0.36,0.08 0.12,0' },
  'א': { w: 0.66, s: '0.04,1 0.62,0|0.6,1 0.54,0.6 0.42,0.5|0.14,0.5 0.08,0.36 0.04,0' },
  'ב': { w: 0.7, s: '0,1 0.52,1 0.58,0.94 0.58,0.08|0,0.06 0.7,0.06' },
  'ג': { w: 0.5, s: '0.08,1 0.42,1 0.42,0|0.42,0.34 0.1,0' },
  'ד': { w: 0.66, s: '0,1 0.66,1|0.5,1 0.5,0' },
  'ה': { w: 0.62, s: '0,1 0.62,1 0.62,0|0.06,0.62 0.06,0' },
  'ו': { w: 0.26, s: '0.04,1 0.22,1 0.22,0' },
  'ז': { w: 0.5, s: '0.04,1 0.5,1|0.27,1 0.27,0' },
  'ח': { w: 0.62, s: '0.04,0 0.04,1 0.62,1 0.62,0' },
  'ט': { w: 0.66, s: '0.06,1 0.04,0.12 0.32,0.04 0.62,0.12 0.64,0.72 0.44,0.86 0.32,0.62' },
  'י': { w: 0.28, s: '0.04,1 0.24,1 0.24,0.6' },
  'כ': { w: 0.62, s: '0,1 0.42,1 A:0.42,0.5,0.2,0.5,90,-90 0,0' },
  'ך': { w: 0.58, s: '0,1 0.54,1 0.54,-0.42' },
  'ל': { w: 0.6, s: '0.04,1.28 0.04,0.74 0.56,0.74 0.56,0.44 0.3,0.04' },
  'מ': { w: 0.66, s: '0.04,1 0.14,0.8 0.04,0|0.12,0.86 0.36,1 0.62,1 0.62,0 0.24,0' },
  'ם': { w: 0.62, s: '0.04,1 0.62,1 0.62,0 0.04,0 0.04,1' },
  'נ': { w: 0.46, s: '0.1,1 0.4,1 0.4,0.06 0.04,0.06' },
  'ן': { w: 0.28, s: '0.04,1 0.24,1 0.24,-0.42' },
  'ס': { w: 0.64, s: '0.02,1 0.62,1 0.62,0.3 A:0.32,0.3,0.3,0.3,0,-180 0.02,1' },
  'ע': { w: 0.66, s: '0.04,1 0.36,0.16 0.12,0|0.62,1 0.42,0.26' },
  'פ': { w: 0.64, s: '0.28,0.62 0.06,0.72 0.06,1 0.6,1 0.6,0.06 0.04,0.06' },
  'ף': { w: 0.58, s: '0.24,0.62 0.06,0.72 0.06,1 0.54,1 0.54,-0.42' },
  'צ': { w: 0.66, s: '0.04,1 0.36,0.36 0.04,0.06 0.66,0.06|0.62,1 0.56,0.62 0.36,0.38' },
  'ץ': { w: 0.62, s: '0.04,1 0.3,0.55 0.3,-0.42|0.6,1 0.54,0.66 0.3,0.55' },
  'ק': { w: 0.62, s: '0.04,1 0.62,1 0.62,0.3|0.08,0.64 0.08,-0.42' },
  'ר': { w: 0.62, s: '0,1 0.42,1 A:0.42,0.8,0.2,0.2,90,0 0.62,0' },
  'ש': { w: 0.68, s: '0.04,1 0.14,0.06 0.64,0.06 0.64,1|0.36,1 0.36,0.36' },
  'ת': { w: 0.64, s: '0,1 0.62,1 0.62,0|0.14,1 0.14,0.08 0.02,0' },
};

function glyphStrokes(ch: string): { w: number; strokes: P2[][] } {
  const g = GLYPHS[ch];
  if (!g) return { w: 0.5, strokes: [] };
  const strokes = g.s.split('|').map((stroke) => {
    const pts: P2[] = [];
    stroke.trim().split(/\s+/).forEach((token) => {
      if (token.startsWith('A:')) {
        const [cx, cy, rx, ry, a0, a1] = token.slice(2).split(',').map(Number);
        pts.push(...arcPoints(cx, cy, rx, ry, a0, a1));
      } else {
        const [x, y] = token.split(',').map(Number);
        pts.push([x, y]);
      }
    });
    return pts;
  });
  return { w: g.w, strokes };
}

/**
 * A line of letters / digits `heightMm` tall: strokes of one radius (at least half the wall), the
 * characters joined by a bar along the baseline so the line is one piece. Hebrew runs right to left.
 */
function textPrims(text: string, heightMm: number, wallMm: number): Prim[] {
  const chars = Array.from(text);
  if (!chars.length) return [];
  const rtl = chars.some((c) => HEBREW_LETTERS.includes(c));
  const ordered = rtl ? chars.slice().reverse() : chars;
  const r = Math.max(heightMm * 0.085, wallMm / 2);
  const gap = heightMm * 0.16 + 2 * r;
  const prims: Prim[] = [];
  let x = 0;
  const several = ordered.length > 1;
  ordered.forEach((ch) => {
    const { w, strokes } = glyphStrokes(ch);
    strokes.forEach((stroke) => prims.push(...strokePrims(scalePoints(stroke, heightMm, x, 0), r)));
    // A yod floats above the baseline: in a word it gets a stem down to the joining bar.
    if (several && ch === 'י') prims.push(capsulePrim([x + 0.24 * heightMm, 0.6 * heightMm], [x + 0.24 * heightMm, 0], r));
    x += w * heightMm + gap;
  });
  const width = x - gap;
  // One bar along the baseline under all the characters joins them into one piece.
  if (several) prims.push(capsulePrim([r, 0], [width - r, 0], Math.max(r * 0.9, wallMm / 2)));
  return prims.map((p) => shiftPrim(p, -width / 2, -heightMm / 2));
}

function shiftPrim(p: Prim, dx: number, dy: number): Prim {
  return { x0: p.x0 + dx, y0: p.y0 + dy, x1: p.x1 + dx, y1: p.y1 + dy, d: (x, y) => p.d(x - dx, y - dy) };
}

// ---------------------------------------------------------------------------------------------
// The motifs
// ---------------------------------------------------------------------------------------------

export interface MotifShape {
  sdf: Sdf;
  /** Recessed parts of the face (engraving, ribs, a solid star's field), inside the shape. */
  grooves: Sdf | null;
  grooveDepthMm: number;
  /** Extrusion thickness (mm). */
  thicknessMm: number;
  /** Box enclosing the shape. */
  min: P2;
  max: P2;
  /** The thinnest stroke the shape is made of (holes and grooves aside), mm. */
  thinnestStrokeMm: number;
}

/** Parametric heart, longest side 1, centred. */
function heartPoints(): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x / 34, (y + 2.5) / 34]);
  }
  return pts;
}

/** A row of tapering circles along a curve (organic strokes): radii never below `minR`. */
function taper(points: P2[], radii: number[], minR: number): Prim[] {
  return strokePrims(points, radii.map((r) => Math.max(r, minR)));
}

/** Builds the shape of an element `size` mm (the longest side) with its minimum wall. */
export function motifShape(def: ElementDef, sizeMm: number, text = '', variant = ''): MotifShape {
  strokeLog = { min: Infinity };
  try {
    return buildMotifShape(def, sizeMm, text, variant, strokeLog);
  } finally {
    strokeLog = null;
  }
}

function buildMotifShape(def: ElementDef, sizeMm: number, text: string, variant: string, log: { min: number }): MotifShape {
  const S = sizeMm;
  const w = def.minWallMm;
  const hw = w / 2;
  const k = (pts: P2[]) => scalePoints(pts, S);
  const R = (r: number) => Math.max(r * S, hw);
  let prims: Prim[] = [];
  let holes: Prim[] = [];
  let grooves: Prim[] = [];
  let grooveDepth = 0;
  let thickness = clampNumber(S * 0.1, 1.0, 1.5);

  switch (def.code) {
    case 'HEART':
      prims = [polygonPrim(roundCorners(k(heartPoints()), 0.1))];
      break;
    case 'STAR': {
      const pts: P2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? 0.5 : 0.5 * 0.45;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      // "The outer points need a slight 0.1 mm fillet."
      prims = [polygonPrim(roundCorners(k(pts), 0.1))];
      break;
    }
    case 'CRESCENT_MOON': {
      const pts = arcPoints(0.08, 0, 0.42, 0.46, 65, 295, 40).map(([x, y]) => [x * S, y * S] as P2);
      const radii = pts.map((_, i) => 0.13 * S * Math.pow(Math.sin((Math.PI * i) / (pts.length - 1)), 0.75));
      // "Keep the 0.8 mm minimum at the narrow tips at any size."
      prims = taper(pts, radii, hw);
      break;
    }
    case 'INFINITY': {
      const pts: P2[] = [];
      for (let i = 0; i <= 72; i++) {
        const t = (i / 72) * Math.PI * 2;
        const d = 1 + Math.sin(t) * Math.sin(t);
        pts.push([(0.44 * Math.cos(t)) / d, (0.44 * Math.sin(t) * Math.cos(t)) / d]);
      }
      prims = strokePrims(k(pts), R(0.06));
      break;
    }
    case 'DOLPHIN': {
      const spine: P2[] = [[-0.47, 0.06], [-0.36, 0.1], [-0.2, 0.12], [-0.02, 0.1], [0.16, 0.04], [0.3, -0.04], [0.38, -0.1]];
      prims = [
        ...taper(k(spine), [0.03, 0.08, 0.12, 0.12, 0.09, 0.05, 0.035].map((r) => r * S), hw),
        polygonPrim(roundCorners(k([[-0.12, 0.18], [0.02, 0.36], [0.08, 0.17]]), 0.15)),
        polygonPrim(roundCorners(k([[0.34, -0.09], [0.5, 0.02], [0.45, -0.1], [0.52, -0.22]]), 0.15)),
        polygonPrim(roundCorners(k([[-0.18, 0.02], [-0.1, -0.12], [-0.04, 0.0]]), 0.15)),
      ];
      break;
    }
    case 'BUTTERFLY': {
      prims = [
        ellipsePrim(-0.22 * S, 0.13 * S, 0.21 * S, 0.17 * S, 25),
        ellipsePrim(0.22 * S, 0.13 * S, 0.21 * S, 0.17 * S, -25),
        ellipsePrim(-0.15 * S, -0.17 * S, 0.14 * S, 0.12 * S, -20),
        ellipsePrim(0.15 * S, -0.17 * S, 0.14 * S, 0.12 * S, 20),
        // "The wings' meeting point is thickened to 0.9 mm at the smallest size."
        capsulePrim([0, 0.2 * S], [0, -0.3 * S], Math.max(0.045 * S, 0.45)),
        ...strokePrims(k([[0, 0.2], [-0.06, 0.34], [-0.12, 0.42]]), hw),
        ...strokePrims(k([[0, 0.2], [0.06, 0.34], [0.12, 0.42]]), hw),
      ];
      break;
    }
    case 'BIRD': {
      prims = [
        ellipsePrim(0, 0, 0.27 * S, 0.13 * S, -8),
        circlePrim(0.26 * S, 0.1 * S, 0.09 * S),
        // The beak: a tapering stroke from the head, never thinner than the wall.
        capsulePrim([0.3 * S, 0.1 * S], [0.46 * S, 0.085 * S], R(0.04), hw),
        polygonPrim(roundCorners(k([[-0.06, 0.04], [0.06, 0.42], [0.2, 0.04]]), 0.2)),
        // The tail starts inside the body, so rounding its corner never parts them.
        polygonPrim(roundCorners(k([[-0.06, 0.02], [-0.5, 0.12], [-0.46, -0.1]]), 0.15)),
      ];
      break;
    }
    case 'SEASHELL': {
      const fan: P2[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = ((15 + (150 * i) / 48) * Math.PI) / 180;
        const r = 0.6 + 0.03 * Math.cos(9 * (a - Math.PI / 2) * 2);
        fan.push([Math.cos(a) * r, -0.38 + Math.sin(a) * r * 0.9]);
      }
      fan.push([0, -0.38]);
      prims = [polygonPrim(roundCorners(k(fan), 0.15)), boxPrim(0, -0.42 * S, 0.14 * S, 0.06 * S, 0.1)];
      // "Ribbed surface: groove depth no more than 0.2 mm."
      for (let i = 1; i < 9; i++) {
        const a = ((15 + (150 * i) / 9) * Math.PI) / 180;
        grooves.push(unlogged(() => capsulePrim([0, -0.33 * S], [Math.cos(a) * 0.52 * S, -0.38 * S + Math.sin(a) * 0.47 * S], Math.max(0.012 * S, 0.12))));
      }
      grooveDepth = 0.2;
      break;
    }
    case 'PAW_PRINT': {
      // Five parts that touch ("a Boolean union into one cast unit").
      prims = [
        ellipsePrim(0, -0.17 * S, 0.24 * S, 0.19 * S),
        ellipsePrim(-0.3 * S, 0.06 * S, 0.1 * S, 0.13 * S, 25),
        ellipsePrim(-0.11 * S, 0.24 * S, 0.1 * S, 0.13 * S, 8),
        ellipsePrim(0.11 * S, 0.24 * S, 0.1 * S, 0.13 * S, -8),
        ellipsePrim(0.3 * S, 0.06 * S, 0.1 * S, 0.13 * S, -25),
        ...strokePrims(k([[-0.3, 0.06], [-0.11, 0.24], [0.11, 0.24], [0.3, 0.06]]), hw),
        ...strokePrims(k([[-0.11, 0.24], [0, -0.1], [0.11, 0.24]]), hw),
        ...strokePrims(k([[-0.3, 0.06], [-0.15, -0.1]]), hw),
        ...strokePrims(k([[0.3, 0.06], [0.15, -0.1]]), hw),
      ];
      break;
    }
    case 'FLOWER': {
      for (let i = 0; i < 5; i++) {
        const a = 90 + i * 72;
        const r = (a * Math.PI) / 180;
        prims.push(ellipsePrim(Math.cos(r) * 0.25 * S, Math.sin(r) * 0.25 * S, 0.25 * S, 0.15 * S, a));
      }
      prims.push(circlePrim(0, 0, Math.max(0.14 * S, w)));
      break;
    }
    case 'LEAF': {
      const blade = intersect(circlePrim(0.28 * S, 0, 0.5 * S).d, circlePrim(-0.28 * S, 0, 0.5 * S).d);
      prims = [
        { x0: -0.25 * S, y0: -0.45 * S, x1: 0.25 * S, y1: 0.45 * S, d: (x, y) => blade(x, y + 0.05 * S) },
        capsulePrim([0, -0.4 * S], [0.03 * S, -0.5 * S], hw),
      ];
      grooves = [unlogged(() => capsulePrim([0, -0.32 * S], [0, 0.3 * S], Math.max(0.012 * S, 0.12)))];
      grooveDepth = 0.2;
      break;
    }
    case 'CLOVER': {
      // "Four connected hearts", their tips at the centre.
      const heart = heartPoints().map(([x, y]) => [x * 0.5, y * 0.5 + 0.22] as P2);
      for (let i = 0; i < 4; i++) prims.push(polygonPrim(roundCorners(k(rotatePoints(heart, i * 90 + 45)), 0.1)));
      prims.push(circlePrim(0, 0, Math.max(0.08 * S, w)));
      prims.push(...strokePrims(k([[0, 0], [0.12, -0.3], [0.18, -0.48]]), R(0.035)));
      break;
    }
    case 'TREE_OF_LIFE': {
      const frame = unlogged(() => subtract(circlePrim(0, 0, 0.5 * S).d, circlePrim(0, 0, 0.5 * S - Math.max(0.06 * S, w)).d));
      const branches: P2[][] = [
        [[0, -0.36], [0, 0.04]],
        [[0, 0.04], [-0.22, 0.26], [-0.38, 0.3]],
        [[0, 0.04], [0.22, 0.26], [0.38, 0.3]],
        [[0, 0.04], [-0.08, 0.3], [-0.16, 0.45]],
        [[0, 0.04], [0.08, 0.3], [0.16, 0.45]],
        [[0, 0.04], [0, 0.48]],
        [[-0.11, 0.15], [-0.32, 0.12], [-0.46, 0.16]],
        [[0.11, 0.15], [0.32, 0.12], [0.46, 0.16]],
        [[0, -0.28], [-0.2, -0.38], [-0.3, -0.4]],
        [[0, -0.28], [0.2, -0.38], [0.3, -0.4]],
        [[0, -0.32], [0, -0.48]],
      ];
      prims = [{ x0: -0.5 * S, y0: -0.5 * S, x1: 0.5 * S, y1: 0.5 * S, d: frame }];
      branches.forEach((b, i) => prims.push(...strokePrims(k(b), R(i === 0 ? 0.05 : 0.03))));
      break;
    }
    case 'FEATHER': {
      const vane: P2[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        // An asymmetric vane: one side wider than the other.
        vane.push([Math.sin(t) * (t < Math.PI ? 0.17 : 0.13), Math.cos(t) * 0.46 + 0.04]);
      }
      prims = [polygonPrim(roundCorners(k(vane), 0.15)), capsulePrim([0, -0.5 * S], [0, 0.42 * S], hw)];
      // Diagonal grooves of the barbs.
      for (let i = -3; i <= 3; i++) {
        const y = i * 0.1 * S + 0.04 * S;
        grooves.push(unlogged(() => capsulePrim([0.02 * S, y], [0.13 * S, y + 0.07 * S], Math.max(0.01 * S, 0.1))));
        grooves.push(unlogged(() => capsulePrim([-0.02 * S, y], [-0.1 * S, y + 0.06 * S], Math.max(0.01 * S, 0.1))));
      }
      grooveDepth = 0.2;
      break;
    }
    case 'HAMSA': {
      prims = [
        boxPrim(0, -0.1 * S, 0.24 * S, 0.24 * S, 0.12 * S),
        capsulePrim([-0.13 * S, 0.05 * S], [-0.13 * S, 0.38 * S], R(0.065)),
        capsulePrim([0, 0.05 * S], [0, 0.46 * S], R(0.065)),
        capsulePrim([0.13 * S, 0.05 * S], [0.13 * S, 0.38 * S], R(0.065)),
        capsulePrim([-0.22 * S, -0.12 * S], [-0.36 * S, 0.12 * S], R(0.06)),
        capsulePrim([0.22 * S, -0.12 * S], [0.36 * S, 0.12 * S], R(0.06)),
        boxPrim(0, -0.4 * S, 0.17 * S, 0.1 * S, 0.06 * S),
      ];
      // The eye, engraved 0.3 mm deep.
      const eye = unlogged(() => intersect(circlePrim(0, -0.17 * S, 0.17 * S).d, circlePrim(0, -0.01 * S, 0.17 * S).d));
      const ring: Sdf = (x, y) => Math.abs(eye(x, y + 0.03 * S)) - Math.max(0.012 * S, 0.12);
      grooves = [
        { x0: -0.2 * S, y0: -0.3 * S, x1: 0.2 * S, y1: 0.05 * S, d: ring },
        unlogged(() => circlePrim(0, -0.12 * S, Math.max(0.035 * S, 0.25))),
      ];
      grooveDepth = 0.3;
      break;
    }
    case 'STAR_OF_DAVID': {
      const tri = (rot: number) => rotatePoints([[0, 0.5], [-0.433, -0.25], [0.433, -0.25]], rot).map(([x, y]) => [x * S, y * S] as P2);
      if (variant === 'SOLID') {
        // "Solid version: a 0.6 mm field inside a raised frame."
        const star = unionPrims([polygonPrim(tri(0)), polygonPrim(tri(180))]);
        prims = [{ x0: -0.5 * S, y0: -0.5 * S, x1: 0.5 * S, y1: 0.5 * S, d: star }];
        const frameW = Math.max(0.06 * S, w);
        grooves = [{ x0: -0.5 * S, y0: -0.5 * S, x1: 0.5 * S, y1: 0.5 * S, d: (x, y) => star(x, y) + frameW }];
        thickness = 1.2;
        grooveDepth = thickness - 0.6;
      } else {
        // "Openwork: the wires are never thinner than 0.8 mm."
        [0, 180].forEach((rot) => {
          const t = tri(rot);
          prims.push(...strokePrims([...t, t[0]], Math.max(0.035 * S, hw)));
        });
      }
      break;
    }
    case 'ANCHOR': {
      // "The top loop hole grows with the anchor and is never under 1.5 mm across."
      const holeR = Math.max(0.055 * S, 0.75);
      const ringR = holeR + Math.max(0.045 * S, w);
      prims = [
        circlePrim(0, 0.5 * S - ringR, ringR),
        capsulePrim([0, 0.5 * S - 2 * ringR], [0, -0.4 * S], R(0.05)),
        capsulePrim([-0.2 * S, 0.22 * S], [0.2 * S, 0.22 * S], R(0.045)),
        ...strokePrims(arcPoints(0, -0.12 * S, 0.32 * S, 0.3 * S, 200, 340, 20), R(0.05)),
        polygonPrim([[-0.4 * S, -0.06 * S], [-0.22 * S, -0.16 * S], [-0.34 * S, -0.27 * S]]),
        polygonPrim([[0.4 * S, -0.06 * S], [0.22 * S, -0.16 * S], [0.34 * S, -0.27 * S]]),
      ];
      holes = [unlogged(() => circlePrim(0, 0.5 * S - ringR, holeR))];
      break;
    }
    case 'ANTIQUE_KEY': {
      const bowC: P2 = [0, 0.33 * S];
      const lobe = 0.09 * S;
      prims = [
        circlePrim(bowC[0], bowC[1] + 0.07 * S, lobe),
        circlePrim(bowC[0] - 0.08 * S, bowC[1] - 0.04 * S, lobe),
        circlePrim(bowC[0] + 0.08 * S, bowC[1] - 0.04 * S, lobe),
        capsulePrim([0, 0.2 * S], [0, -0.46 * S], R(0.045)),
        capsulePrim([-0.07 * S, 0.14 * S], [0.07 * S, 0.14 * S], R(0.03)),
        boxPrim(0.1 * S, -0.4 * S, 0.08 * S, 0.06 * S, 0.1),
        boxPrim(0.1 * S, -0.27 * S, 0.06 * S, 0.035 * S, 0.1),
      ];
      holes = [unlogged(() => circlePrim(bowC[0], bowC[1] + 0.01 * S, Math.max(0.05 * S, 0.5)))];
      break;
    }
    case 'HORSESHOE': {
      const pts = arcPoints(0, 0.04 * S, 0.36 * S, 0.4 * S, -55, 235, 36);
      // "The ends are thickened to 0.9 mm so they do not bend."
      const radii = pts.map((_, i) => (i === 0 || i === pts.length - 1 ? Math.max(0.1 * S, 0.45) : Math.max(0.09 * S, hw)));
      prims = strokePrims(pts, radii);
      if (S >= 8) {
        for (let i = 0; i < 6; i++) {
          const a = ((-20 + i * 44) * Math.PI) / 180;
          holes.push(unlogged(() => circlePrim(Math.cos(a) * 0.36 * S, 0.04 * S + Math.sin(a) * 0.4 * S, Math.max(0.02 * S, 0.2))));
        }
      }
      break;
    }
    case 'CROSS': {
      const half = Math.max(0.075 * S, hw);
      prims = [boxPrim(0, 0, half, 0.5 * S, half * 0.3), boxPrim(0, 0.17 * S, 0.3 * S, half, half * 0.3)];
      break;
    }
    case 'ANGEL_WINGS': {
      const wing = (side: number): Prim[] => {
        const f = (pts: P2[]) => k(side < 0 ? mirrorX(pts) : pts);
        const lobes: Prim[] = [];
        for (let i = 0; i < 4; i++) {
          const y = 0.26 - i * 0.15;
          const x0 = 0.04;
          const x1 = 0.44 - i * 0.07;
          lobes.push(...strokePrims(f([[x0, y], [x1, y - 0.05]]), R(0.07 - i * 0.008)));
          grooves.push(...unlogged(() => strokePrims(f([[x0 + 0.06, y - 0.07], [x1 - 0.04, y - 0.1]]), Math.max(0.008 * S, 0.1))));
        }
        lobes.push(polygonPrim(roundCorners(f([[0.02, 0.36], [0.42, 0.3], [0.48, 0.18], [0.04, -0.3]]), 0.2)));
        return lobes;
      };
      // "The seam between the two wings merges with no gap."
      prims = variant === 'SINGLE' ? wing(1).map((p) => shiftPrim(p, -0.24 * S, 0)) : [...wing(1), ...wing(-1), capsulePrim([0, 0.3 * S], [0, -0.25 * S], R(0.05))];
      if (variant === 'SINGLE') grooves = grooves.map((p) => shiftPrim(p, -0.24 * S, 0));
      grooveDepth = 0.2;
      break;
    }
    case 'LETTERS':
    case 'NUMBERS': {
      const t = elementText(def, text) || (def.code === 'NUMBERS' ? DIGITS[7] : 'A');
      prims = textPrims(t, S, w);
      // "Extrusion depth fixed between 1.0 and 1.5 mm."
      thickness = clampNumber(S * 0.15, 1.0, 1.5);
      break;
    }
    default: {
      // An element the catalogue does not know (an uploaded picture): a round plaque.
      prims = [circlePrim(0, 0, S / 2)];
    }
  }

  const base = unionPrims(prims);
  const sdf = holes.length ? subtract(base, unionPrims(holes)) : base;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  prims.forEach((p) => {
    x0 = Math.min(x0, p.x0);
    y0 = Math.min(y0, p.y0);
    x1 = Math.max(x1, p.x1);
    y1 = Math.max(y1, p.y1);
  });
  // Grooves stay a wall's width inside the outline, so the outer walls keep their full height.
  const groove = grooves.length ? intersect(unionPrims(grooves), (x, y) => sdf(x, y) + w) : null;
  return {
    sdf,
    grooves: groove,
    grooveDepthMm: groove ? grooveDepth : 0,
    thicknessMm: thickness,
    min: [x0, y0],
    max: [x1, y1],
    thinnestStrokeMm: Number.isFinite(log.min) ? log.min * 2 : Infinity,
  };
}

export interface MotifOutline {
  shape: Region;
  grooves: Region | null;
  grooveDepthMm: number;
  thicknessMm: number;
}

/**
 * Outlines already traced (the studio rebuilds the piece at every change, mostly with the same
 * elements). Bounded; the outlines are never changed by their users.
 */
const OUTLINE_CACHE_SIZE = 48;
const outlineCache = new Map<string, MotifOutline>();

/** The element's outlines, centred on its bounding box. */
export function motifOutline(def: ElementDef, sizeMm: number, text = '', variant = ''): MotifOutline {
  const key = `${def.code}|${sizeMm}|${text}|${variant}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  const outline = traceMotifOutline(def, sizeMm, text, variant);
  if (outlineCache.size >= OUTLINE_CACHE_SIZE) outlineCache.clear();
  outlineCache.set(key, outline);
  return outline;
}

function traceMotifOutline(def: ElementDef, sizeMm: number, text: string, variant: string): MotifOutline {
  const m = motifShape(def, sizeMm, text, variant);
  const span = Math.max(m.max[0] - m.min[0], m.max[1] - m.min[1]);
  const step = clampNumber(span / 140, 0.03, 0.2);
  const shape = traceRegion(m.sdf, m.min, m.max, step);
  const cx = (shape.min[0] + shape.max[0]) / 2;
  const cy = (shape.min[1] + shape.max[1]) / 2;
  const centre = (r: Region): Region => ({
    shapes: r.shapes.map((s) => ({ outer: scalePoints(s.outer, 1, -cx, -cy), holes: s.holes.map((h) => scalePoints(h, 1, -cx, -cy)) })),
    min: [r.min[0] - cx, r.min[1] - cy],
    max: [r.max[0] - cx, r.max[1] - cy],
  });
  const grooves = m.grooves ? traceRegion(m.grooves, m.min, m.max, step) : null;
  return {
    shape: centre(shape),
    grooves: grooves && grooves.shapes.length ? centre(grooves) : null,
    grooveDepthMm: m.grooveDepthMm,
    thicknessMm: m.thicknessMm,
  };
}
