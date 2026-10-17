/**
 * Parametric jewelry geometry: the one source of truth for what a design looks like.
 *
 * The server builds STL exports and rendered pictures from it, and the app's 3D studio runs the
 * same code (transpiled into the viewer by `app/scripts/sync-jewelry-geometry.cjs`), so the
 * preview, the picture and the manufacturing file show the same piece.
 *
 * Units are millimetres. Y is up. A ring stands with its finger hole facing +Z (toward the
 * viewer) and its head on top (+Y). Necklaces, bracelets and earrings lie in the XY plane, facing
 * +Z. This file must stay free of imports: it is embedded verbatim in a WebView.
 */

export type Vec3 = [number, number, number];

export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

export type ItemTypeCode = 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS';
export type SettingCode = '4_PRONG' | '6_PRONG' | 'BEZEL' | 'PAVE';
export type StoneShape = 'ROUND' | 'OVAL' | 'EMERALD';
export type ElementCode = 'HEART' | 'STAR' | 'LEAF' | 'INITIAL';

export interface StoneSpec {
  code: string;
  shape: StoneShape;
  /** Girdle diameter (longest side for oval / emerald cuts); null = the default for its role. */
  sizeMm: number | null;
  /** Angle on the piece (radians, 0 = right, PI/2 = top), from the studio placement. */
  angle: number;
}

export interface ElementSpec {
  code: ElementCode;
  angle: number;
}

export interface JewelrySpec {
  itemType: ItemTypeCode;
  metalCode: string;
  purityCode: string;
  finishCode: string;
  ring: { innerDiameterMm: number; bandWidthMm: number; bandThicknessMm: number };
  necklace: { lengthMm: number };
  bracelet: { innerCircumferenceMm: number };
  earrings: { style: 'stud' | 'drop' };
  setting: SettingCode | null;
  stones: StoneSpec[];
  elements: ElementSpec[];
}

export interface JewelryPart {
  material: 'metal' | 'stone';
  /** Metal or stone code, used to pick the colour. */
  code: string;
  mesh: MeshData;
}

export interface JewelryModel {
  spec: JewelrySpec;
  parts: JewelryPart[];
}

/** Display colours (sRGB), shared by the studio swatches, the 3D viewer and rendered pictures. */
export const METAL_COLORS: Record<string, string> = {
  YELLOW_GOLD: '#E4C441',
  ROSE_GOLD: '#C76B6B',
  WHITE_GOLD: '#D8D8DE',
  SILVER: '#C5C5C5',
  PLATINUM: '#E2E2E6',
};

/**
 * Linear-light reflectance (F0) of each metal for physically based shading — what the 3D viewer
 * and rendered pictures use; the hex colours above are for flat UI swatches.
 */
export const METAL_REFLECTANCE: Record<string, [number, number, number]> = {
  YELLOW_GOLD: [1.0, 0.77, 0.34],
  ROSE_GOLD: [0.96, 0.62, 0.52],
  WHITE_GOLD: [0.86, 0.85, 0.82],
  SILVER: [0.97, 0.96, 0.91],
  PLATINUM: [0.68, 0.66, 0.62],
};

export const STONE_COLORS: Record<string, string> = {
  DIAMOND: '#F5F7FF',
  SAPPHIRE: '#2B5CDE',
  RUBY: '#C41E3A',
  EMERALD: '#1F8A4C',
};

export const DEFAULT_RING_INNER_DIAMETER_MM = 17.35;
export const DEFAULT_BAND_WIDTH_MM = 3;
export const DEFAULT_NECKLACE_LENGTH_CM = 45;
export const DEFAULT_WRIST_CM = 16.5;
/**
 * Most stones / decorative elements one piece is built with. The studio offers 3 of each; the
 * server refuses more than these (they bound the mesh, so a crafted design cannot exhaust memory).
 */
export const MAX_STONES = 12;
export const MAX_ELEMENTS = 6;
/** Room for the wrist to move inside a chain bracelet. */
const BRACELET_EASE_MM = 15;
const CENTER_STONE_MM = 5.2;

// ---------------------------------------------------------------------------------------------
// Parameters → spec
// ---------------------------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Inner diameter of a ring size. Israeli sizes are the inner circumference in millimetres; US
 * sizes follow the standard 11.63 + 0.8128 × size. A size chart diameter, when known, wins.
 */
export function ringInnerDiameterMm(standard: unknown, sizeCode: unknown, chartDiameterMm?: number | null): number {
  if (chartDiameterMm != null && Number.isFinite(chartDiameterMm) && chartDiameterMm > 10 && chartDiameterMm < 30) {
    return chartDiameterMm;
  }
  const n = finite(sizeCode);
  if (n == null) return DEFAULT_RING_INNER_DIAMETER_MM;
  const std = typeof standard === 'string' ? standard.toUpperCase() : n > 30 ? 'IL' : 'US';
  if (std === 'US') return clamp(11.63 + 0.8128 * n, 12, 26);
  if (std === 'UK') return DEFAULT_RING_INNER_DIAMETER_MM;
  // IL and EU sizes are the inner circumference in millimetres.
  return clamp(n / Math.PI, 12, 26);
}

/** Radial thickness of the band: wider bands are a little thicker (comfort-fit proportions). */
export function bandThicknessMm(bandWidthMm: number): number {
  return clamp(1.4 + 0.12 * bandWidthMm, 1.5, 2.6);
}

/** The angle on the piece of a studio placement ({x, y} on a unit circle; see studioParams). */
export function placementAngle(placement: unknown, fallbackIndex: number): number {
  const p = record(placement);
  const x = finite(p?.x);
  const y = finite(p?.y);
  const z = finite(p?.z);
  if (x == null || y == null) return (fallbackIndex / 6) * Math.PI * 2;
  // Older placements lay in the XZ plane (ring lying flat); the studio reads them the same way.
  if (z != null && Math.abs(y) < 0.45 && Math.hypot(x, z) > 0.45) return Math.atan2(z, x);
  return Math.atan2(y, x);
}

const SETTINGS: readonly SettingCode[] = ['4_PRONG', '6_PRONG', 'BEZEL', 'PAVE'];
const SHAPES: readonly StoneShape[] = ['ROUND', 'OVAL', 'EMERALD'];
const ELEMENTS: readonly ElementCode[] = ['HEART', 'STAR', 'LEAF', 'INITIAL'];

export interface SpecLookups {
  /** Inner diameter from the size chart (mean of its min / max), when the caller has it. */
  ringChartDiameterMm?: number | null;
}

/** Normalises stored design parameters (any shape, possibly partial) into a buildable spec. */
export function specFromParameters(itemType: string, parameters: unknown, lookups: SpecLookups = {}): JewelrySpec {
  const params = record(parameters) ?? {};
  const size = record(params.size) ?? {};
  const metal = record(params.metal) ?? {};
  const setting = record(params.setting);
  const kind: ItemTypeCode =
    itemType === 'NECKLACE' || itemType === 'BRACELET' || itemType === 'EARRINGS' ? itemType : 'RING';

  const bandWidth = clamp(finite(size.bandWidthMm) ?? DEFAULT_BAND_WIDTH_MM, 0.5, 15);
  const settingCode = typeof setting?.settingCode === 'string' ? setting.settingCode : null;
  const stones: StoneSpec[] = [];
  if (Array.isArray(params.stones)) {
    params.stones.slice(0, MAX_STONES).forEach((item, index) => {
      const s = record(item);
      if (!s || typeof s.stoneCode !== 'string' || !s.stoneCode) return;
      const shape = typeof s.shape === 'string' ? s.shape.toUpperCase() : 'ROUND';
      const sizeMm = finite(s.sizeMm);
      stones.push({
        code: s.stoneCode,
        shape: (SHAPES as readonly string[]).includes(shape) ? (shape as StoneShape) : 'ROUND',
        sizeMm: sizeMm != null && sizeMm >= 0.8 && sizeMm <= 25 ? sizeMm : null,
        angle: placementAngle(s.placement, index),
      });
    });
  }
  const elements: ElementSpec[] = [];
  if (Array.isArray(params.elements)) {
    params.elements.slice(0, MAX_ELEMENTS).forEach((item, index) => {
      const e = record(item);
      if (!e) return;
      const code = typeof e.elementCode === 'string' ? e.elementCode.toUpperCase() : '';
      // A custom picture element has no shape of its own: it is made as a flat plaque.
      const known = (ELEMENTS as readonly string[]).includes(code) ? (code as ElementCode) : 'INITIAL';
      if (!code && typeof e.customUploadId !== 'string') return;
      elements.push({ code: known, angle: placementAngle(e.placement, index) });
    });
  }
  const style = typeof size.earringStyleCode === 'string' && size.earringStyleCode.toLowerCase() === 'drop' ? 'drop' : 'stud';

  return {
    itemType: kind,
    metalCode: typeof metal.metalCode === 'string' ? metal.metalCode : 'YELLOW_GOLD',
    purityCode: typeof metal.purityCode === 'string' ? metal.purityCode : '14K',
    finishCode: typeof params.finishCode === 'string' ? params.finishCode : 'POLISHED',
    ring: {
      innerDiameterMm: ringInnerDiameterMm(size.standard, size.sizeCode, lookups.ringChartDiameterMm),
      bandWidthMm: bandWidth,
      bandThicknessMm: bandThicknessMm(bandWidth),
    },
    necklace: { lengthMm: clamp(finite(size.necklaceLengthCm) ?? DEFAULT_NECKLACE_LENGTH_CM, 20, 100) * 10 },
    bracelet: {
      innerCircumferenceMm: clamp(finite(size.wristCircumferenceCm) ?? DEFAULT_WRIST_CM, 10, 30) * 10 + BRACELET_EASE_MM,
    },
    earrings: { style },
    setting: settingCode && (SETTINGS as readonly string[]).includes(settingCode) ? (settingCode as SettingCode) : null,
    stones,
    elements,
  };
}

// ---------------------------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------------------------

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 1];
}
function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Any unit vector perpendicular to `a`. */
function perpendicular(a: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(a, helper));
}

/** Orthonormal frame: local (x, y, z) → origin + X·x + Y·y + Z·z. */
interface Frame {
  origin: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

function frameFromUp(origin: Vec3, up: Vec3, forwardHint: Vec3): Frame {
  const y = norm(up);
  let x = cross(forwardHint, y);
  if (len(x) < 1e-6) x = perpendicular(y);
  x = norm(x);
  const z = norm(cross(x, y));
  return { origin, x, y, z };
}

function toWorld(f: Frame, p: Vec3): Vec3 {
  return [
    f.origin[0] + f.x[0] * p[0] + f.y[0] * p[1] + f.z[0] * p[2],
    f.origin[1] + f.x[1] * p[0] + f.y[1] * p[1] + f.z[1] * p[2],
    f.origin[2] + f.x[2] * p[0] + f.y[2] * p[1] + f.z[2] * p[2],
  ];
}

function dirToWorld(f: Frame, d: Vec3): Vec3 {
  return [
    f.x[0] * d[0] + f.y[0] * d[1] + f.z[0] * d[2],
    f.x[1] * d[0] + f.y[1] * d[1] + f.z[1] * d[2],
    f.x[2] * d[0] + f.y[2] * d[1] + f.z[2] * d[2],
  ];
}

// ---------------------------------------------------------------------------------------------
// Mesh builder
// ---------------------------------------------------------------------------------------------

class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  indices: number[] = [];

  vertex(p: Vec3, n: Vec3): number {
    this.positions.push(p[0], p[1], p[2]);
    const u = norm(n);
    this.normals.push(u[0], u[1], u[2]);
    return this.positions.length / 3 - 1;
  }

  private pos(i: number): Vec3 {
    return [this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]];
  }

  private nrm(i: number): Vec3 {
    return [this.normals[i * 3], this.normals[i * 3 + 1], this.normals[i * 3 + 2]];
  }

  /** Adds a triangle wound so its face normal agrees with its vertex normals (outward). */
  tri(a: number, b: number, c: number): void {
    const pa = this.pos(a);
    const face = cross(sub(this.pos(b), pa), sub(this.pos(c), pa));
    if (len(face) < 1e-14) return;
    const n = add(add(this.nrm(a), this.nrm(b)), this.nrm(c));
    if (dot(face, n) >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** A flat-shaded polygon (its own vertices, one normal), fanned from the first corner. */
  flatPolygon(points: Vec3[], outward: Vec3): void {
    if (points.length < 3) return;
    let n = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    for (let i = 3; len(n) < 1e-12 && i < points.length; i++) n = cross(sub(points[1], points[0]), sub(points[i], points[0]));
    if (dot(n, outward) < 0) n = scale(n, -1);
    const ids = points.map((p) => this.vertex(p, n));
    for (let i = 1; i < ids.length - 1; i++) this.tri(ids[0], ids[i], ids[i + 1]);
  }

  data(): MeshData {
    return { positions: this.positions, normals: this.normals, indices: this.indices };
  }
}

// ---------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------

type Point2 = [number, number];

/** Outward 2D normals of a closed or open polyline, pointing away from `centre`. */
function profileNormals(points: Point2[], closed: boolean, centre: Point2): Point2[] {
  return points.map((p, i) => {
    const prev = points[i > 0 ? i - 1 : closed ? points.length - 1 : 0];
    const next = points[i < points.length - 1 ? i + 1 : closed ? 0 : points.length - 1];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    let nx = ty;
    let ny = -tx;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    if (nx * (p[0] - centre[0]) + ny * (p[1] - centre[1]) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [nx, ny];
  });
}

/**
 * Revolves a profile of (radius, height) points about an axis. Axis 'Z': (r cos t, r sin t, h);
 * axis 'Y': (r cos t, h, r sin t). The profile is closed when it outlines a solid's section.
 */
function revolve(
  mesh: MeshBuilder,
  profile: Point2[],
  segments: number,
  axis: 'Y' | 'Z',
  origin: Vec3,
  closed: boolean,
  profileCentre?: Point2,
): void {
  const centre: Point2 =
    profileCentre ??
    [profile.reduce((s, p) => s + p[0], 0) / profile.length, profile.reduce((s, p) => s + p[1], 0) / profile.length];
  const normals2 = profileNormals(profile, closed, centre);
  const rows: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    rows.push(
      profile.map((p, j) => {
        const n = normals2[j];
        const point: Vec3 = axis === 'Z' ? [p[0] * c, p[0] * s, p[1]] : [p[0] * c, p[1], p[0] * s];
        const normal: Vec3 = axis === 'Z' ? [n[0] * c, n[0] * s, n[1]] : [n[0] * c, n[1], n[0] * s];
        return mesh.vertex(add(origin, point), normal);
      }),
    );
  }
  const count = profile.length;
  const spans = closed ? count : count - 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < spans; j++) {
      const j2 = (j + 1) % count;
      mesh.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j2], rows[i][j2]);
    }
  }
}

/** A rounded rectangle section (counter-clockwise) for the ring band, `steps` points per corner. */
function roundedRect(r0: number, r1: number, h0: number, h1: number, corner: number, steps: number): Point2[] {
  const c = Math.min(corner, (r1 - r0) / 2, (h1 - h0) / 2);
  const corners: Array<[number, number, number]> = [
    [r1 - c, h0 + c, -Math.PI / 2],
    [r1 - c, h1 - c, 0],
    [r0 + c, h1 - c, Math.PI / 2],
    [r0 + c, h0 + c, Math.PI],
  ];
  const points: Point2[] = [];
  corners.forEach(([cx, cy, start]) => {
    for (let k = 0; k <= steps; k++) {
      const a = start + (k / steps) * (Math.PI / 2);
      points.push([cx + Math.cos(a) * c, cy + Math.sin(a) * c]);
    }
  });
  return points;
}

/** Rotation-minimising frames along a path (parallel transport). */
function pathFrames(path: Vec3[], closed: boolean): Array<{ t: Vec3; n: Vec3; b: Vec3 }> {
  const count = path.length;
  const tangents = path.map((_, i) => {
    const prev = path[i > 0 ? i - 1 : closed ? count - 1 : 0];
    const next = path[i < count - 1 ? i + 1 : closed ? 0 : count - 1];
    return norm(sub(next, prev));
  });
  let n = perpendicular(tangents[0]);
  const frames = tangents.map((t) => {
    n = norm(sub(n, scale(t, dot(n, t))));
    if (len(n) < 1e-6) n = perpendicular(t);
    return { t, n, b: norm(cross(t, n)) };
  });
  return frames;
}

/** A round wire swept along a path, with flat caps on open ends. */
function tube(mesh: MeshBuilder, path: Vec3[], radius: number, radial: number, closed: boolean): void {
  if (path.length < 2) return;
  const frames = pathFrames(path, closed);
  const rings = path.map((p, i) => {
    const { n, b } = frames[i];
    const ring: number[] = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const dir = add(scale(n, Math.cos(a)), scale(b, Math.sin(a)));
      ring.push(mesh.vertex(add(p, scale(dir, radius)), dir));
    }
    return ring;
  });
  const spans = closed ? path.length : path.length - 1;
  for (let i = 0; i < spans; i++) {
    const a = rings[i];
    const b = rings[(i + 1) % rings.length];
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      mesh.quad(a[k], b[k], b[k2], a[k2]);
    }
  }
  if (!closed) {
    [0, path.length - 1].forEach((i) => {
      const outward = i === 0 ? scale(frames[0].t, -1) : frames[i].t;
      const pts: Vec3[] = [];
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        pts.push(add(path[i], scale(add(scale(frames[i].n, Math.cos(a)), scale(frames[i].b, Math.sin(a))), radius)));
      }
      mesh.flatPolygon(pts, outward);
    });
  }
}

function sphere(mesh: MeshBuilder, centre: Vec3, radius: number, segments: number): void {
  const rows = Math.max(3, Math.round(segments / 2));
  const grid: number[][] = [];
  for (let i = 0; i <= rows; i++) {
    const phi = (i / rows) * Math.PI;
    const row: number[] = [];
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const n: Vec3 = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      row.push(mesh.vertex(add(centre, scale(n, radius)), n));
    }
    grid.push(row);
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segments; j++) mesh.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
  }
}

/** Torus in the plane spanned by `u` and `v` (unit, perpendicular) around `centre`. */
function torus(mesh: MeshBuilder, centre: Vec3, u: Vec3, v: Vec3, major: number, minor: number, segments = 32): void {
  const path: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    path.push(add(centre, add(scale(u, Math.cos(a) * major), scale(v, Math.sin(a) * major))));
  }
  tube(mesh, path, minor, 10, true);
}

/** Catmull-Rom smoothing of a control polyline. */
function smoothPath(control: Vec3[], samplesPerSpan: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < control.length - 1; i++) {
    const p0 = control[Math.max(0, i - 1)];
    const p1 = control[i];
    const p2 = control[i + 1];
    const p3 = control[Math.min(control.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSpan; s++) {
      const t = s / samplesPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1, 2].map(
        (k) =>
          0.5 *
          (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
      ) as Vec3);
    }
  }
  out.push(control[control.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Stones
// ---------------------------------------------------------------------------------------------

/** Girdle outline (x, z) of a cut, scaled so its longest side equals `size`. */
function girdleOutline(shape: StoneShape, size: number): Point2[] {
  const r = size / 2;
  if (shape === 'OVAL') {
    const pts: Point2[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.72]);
    }
    return pts;
  }
  if (shape === 'EMERALD') {
    const hx = r;
    const hz = r * 0.72;
    const cut = r * 0.22;
    return [
      [hx, -hz + cut],
      [hx, hz - cut],
      [hx - cut, hz],
      [-hx + cut, hz],
      [-hx, hz - cut],
      [-hx, -hz + cut],
      [-hx + cut, -hz],
      [hx - cut, -hz],
    ];
  }
  const pts: Point2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Distance from the outline's centre to its edge in direction `angle` (in the outline's plane). */
function outlineReach(outline: Point2[], angle: number): number {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let best = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (a[0] * ez - a[1] * ex) / den;
    const s = (a[0] * dz - a[1] * dx) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}

/**
 * A faceted gemstone, table up (+Y in its frame), girdle centred on the frame origin. Proportions
 * follow a round brilliant: table 56 %, crown 16 %, girdle 3 %, pavilion 43 % of the diameter.
 */
function gem(mesh: MeshBuilder, frame: Frame, shape: StoneShape, size: number): void {
  const outline = girdleOutline(shape, size);
  const crown = size * 0.16;
  const girdle = size * 0.03;
  const pavilion = size * 0.43;
  const top = outline.map(([x, z]) => toWorld(frame, [x * 0.56, girdle / 2 + crown, z * 0.56]));
  const upper = outline.map(([x, z]) => toWorld(frame, [x, girdle / 2, z]));
  const lower = outline.map(([x, z]) => toWorld(frame, [x, -girdle / 2, z]));
  const culet = toWorld(frame, [0, -girdle / 2 - pavilion, 0]);
  const centre = frame.origin;
  const count = outline.length;
  mesh.flatPolygon(top, frame.y);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const crownMid = scale(add(add(top[i], top[j]), add(upper[i], upper[j])), 0.25);
    mesh.flatPolygon([top[i], upper[i], upper[j], top[j]], sub(crownMid, centre));
    const girdleMid = scale(add(add(upper[i], upper[j]), add(lower[i], lower[j])), 0.25);
    mesh.flatPolygon([upper[i], lower[i], lower[j], upper[j]], sub(girdleMid, centre));
    const pavMid = scale(add(add(lower[i], lower[j]), culet), 1 / 3);
    mesh.flatPolygon([lower[i], culet, lower[j]], sub(pavMid, centre));
  }
}

function stoneSize(stone: StoneSpec | undefined, fallback: number): number {
  return stone?.sizeMm ?? fallback;
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

/** Offsets a convex outline outward by `d` (negative shrinks). */
function offsetOutline(outline: Point2[], d: number): Point2[] {
  return outline.map(([x, z]) => {
    const r = Math.hypot(x, z) || 1;
    return [x + (x / r) * d, z + (z / r) * d];
  });
}

/**
 * Prong head holding a stone whose girdle centre is `frame.origin` (table along frame.y). The
 * prongs start `baseDepth` below the girdle, so they reach into what they are soldered to.
 */
function prongHead(metal: MeshBuilder, frame: Frame, outline: Point2[], size: number, prongs: number, baseDepth: number, baseSpread: number): void {
  const wire = clamp(size * 0.085, 0.32, 0.6);
  const crown = size * 0.16;
  const pavilion = size * 0.43;
  for (let k = 0; k < prongs; k++) {
    const a = (k / prongs) * Math.PI * 2 + Math.PI / prongs;
    const reach = outlineReach(outline, a);
    const dir: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    const control: Vec3[] = [
      add([0, -baseDepth, 0], scale(dir, baseSpread)),
      add([0, -pavilion * 0.6, 0], scale(dir, reach * 0.55)),
      add([0, 0, 0], scale(dir, reach + wire * 0.6)),
      add([0, crown * 0.45, 0], scale(dir, reach * 0.93)),
    ];
    const path = smoothPath(control, 6).map((p) => toWorld(frame, p));
    tube(metal, path, wire, 10, false);
    sphere(metal, path[path.length - 1], wire * 1.1, 10);
  }
  // Gallery rail tying the prongs together under the girdle.
  const rail: Vec3[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const reach = outlineReach(outline, a) * 0.6;
    rail.push(toWorld(frame, [Math.cos(a) * reach, -pavilion * 0.5, Math.sin(a) * reach]));
  }
  tube(metal, rail, wire * 0.8, 8, true);
}

/** A bezel cup around the girdle: a closed metal wall from `baseDepth` below to just over the girdle. */
function bezelCup(metal: MeshBuilder, frame: Frame, outline: Point2[], size: number, baseDepth: number): void {
  const wall = clamp(size * 0.12, 0.5, 1.0);
  const lip = size * 0.16 * 0.35;
  const sections: Array<{ offset: number; y: number }> = [
    { offset: wall * 0.6, y: -baseDepth },
    { offset: wall, y: -baseDepth * 0.35 },
    { offset: wall, y: lip },
    { offset: -wall * 0.15, y: lip },
    { offset: -wall * 0.15, y: -size * 0.03 },
    { offset: -wall * 0.5, y: -size * 0.03 },
    { offset: -wall * 0.5, y: -baseDepth + wall * 0.4 },
  ];
  const rings = sections.map((s) => offsetOutline(outline, s.offset).map(([x, z]) => toWorld(frame, [x, s.y, z])));
  const count = outline.length;
  // The sections outline the wall's cross-section (offset, height); its winding tells which side
  // of each edge is outside.
  let area = 0;
  sections.forEach((s, r) => {
    const n = sections[(r + 1) % sections.length];
    area += s.offset * n.y - n.offset * s.y;
  });
  const ccw = area > 0;
  for (let r = 0; r < rings.length; r++) {
    const a = rings[r];
    const b = rings[(r + 1) % rings.length];
    const sa = sections[r];
    const sb = sections[(r + 1) % sections.length];
    const dOff = sb.offset - sa.offset;
    const dY = sb.y - sa.y;
    const nOff = ccw ? dY : -dY;
    const nY = ccw ? -dOff : dOff;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const mid = scale(add(add(a[i], a[j]), add(b[i], b[j])), 0.25);
      const fromAxis = sub(mid, toWorld(frame, [0, dot(sub(mid, frame.origin), frame.y), 0]));
      const outward = add(scale(norm(fromAxis), nOff), scale(frame.y, nY));
      metal.flatPolygon([a[i], b[i], b[j], a[j]], outward);
    }
  }
}

/** Sets one stone with its head: prongs, bezel, or flush (accent stones on a band). */
function setStone(
  metal: MeshBuilder,
  stoneMesh: MeshBuilder,
  frame: Frame,
  stone: StoneSpec,
  size: number,
  setting: SettingCode,
  baseDepth: number,
  baseSpread: number,
): void {
  const outline = girdleOutline(stone.shape, size);
  gem(stoneMesh, frame, stone.shape, size);
  if (setting === 'BEZEL') bezelCup(metal, frame, outline, size, baseDepth);
  else prongHead(metal, frame, outline, size, setting === '6_PRONG' ? 6 : 4, baseDepth, baseSpread);
}

// ---------------------------------------------------------------------------------------------
// Decorative elements
// ---------------------------------------------------------------------------------------------

function elementOutline(code: ElementCode, size: number): Point2[] {
  const r = size / 2;
  const pts: Point2[] = [];
  if (code === 'HEART') {
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([(x / 17) * r, (y / 17) * r + r * 0.1]);
    }
    return pts;
  }
  if (code === 'STAR') {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return pts;
  }
  if (code === 'LEAF') {
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      pts.push([Math.sin(t) * r * 0.5 * Math.abs(Math.sin(t / 2)) * 1.6, Math.cos(t) * r]);
    }
    return pts;
  }
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** A flat metal shape of `thickness`, its face along frame.z, centred on the frame origin. */
function plaque(metal: MeshBuilder, frame: Frame, code: ElementCode, size: number, thickness: number): void {
  const outline = elementOutline(code, size);
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  const front = outline.map(([x, y]) => toWorld(frame, [x, y, thickness / 2]));
  const back = outline.map(([x, y]) => toWorld(frame, [x, y, -thickness / 2]));
  const fc = toWorld(frame, [cx, cy, thickness / 2]);
  const bc = toWorld(frame, [cx, cy, -thickness / 2]);
  const fn = metal.vertex(fc, frame.z);
  const bn = metal.vertex(bc, scale(frame.z, -1));
  const fi = front.map((p) => metal.vertex(p, frame.z));
  const bi = back.map((p) => metal.vertex(p, scale(frame.z, -1)));
  const count = outline.length;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    metal.tri(fn, fi[i], fi[j]);
    metal.tri(bn, bi[j], bi[i]);
    const edgeMid = scale(add(front[i], front[j]), 0.5);
    metal.flatPolygon([front[i], back[i], back[j], front[j]], sub(edgeMid, fc));
  }
  if (code === 'INITIAL') {
    // A raised rim marks the plaque that carries the engraved initial.
    torus(metal, toWorld(frame, [0, 0, thickness / 2]), frame.x, frame.y, size / 2 - thickness * 0.6, thickness * 0.35, 40);
  }
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

class PartSet {
  metal = new MeshBuilder();
  private stones = new Map<string, MeshBuilder>();

  stone(code: string): MeshBuilder {
    let mesh = this.stones.get(code);
    if (!mesh) {
      mesh = new MeshBuilder();
      this.stones.set(code, mesh);
    }
    return mesh;
  }

  parts(metalCode: string): JewelryPart[] {
    const out: JewelryPart[] = [{ material: 'metal', code: metalCode, mesh: this.metal.data() }];
    this.stones.forEach((mesh, code) => {
      if (mesh.indices.length) out.push({ material: 'stone', code, mesh: mesh.data() });
    });
    return out;
  }
}

/** Keeps a decoration placed on a ring band out of the head on top. */
function awayFromHead(angle: number, hasHead: boolean): number {
  if (!hasHead) return angle;
  const top = Math.PI / 2;
  let d = Math.atan2(Math.sin(angle - top), Math.cos(angle - top));
  const min = 0.42;
  if (Math.abs(d) < min) d = d >= 0 ? min : -min;
  return top + d;
}

function buildRing(spec: JewelrySpec, set: PartSet): void {
  const ri = spec.ring.innerDiameterMm / 2;
  const w = spec.ring.bandWidthMm;
  const t = spec.ring.bandThicknessMm;
  const ro = ri + t;
  revolve(set.metal, roundedRect(ri, ro, -w / 2, w / 2, Math.min(t, w) * 0.4, 5), 160, 'Z', [0, 0, 0], true, [
    ri + t / 2,
    0,
  ]);

  const [main, ...accents] = spec.stones;
  const setting = spec.setting ?? (main ? '4_PRONG' : null);
  let hasHead = false;

  if (setting === 'PAVE') {
    // Pavé: a row (two on wide bands) of small stones set into the top of the band.
    const code = main?.code ?? 'DIAMOND';
    const rows = w >= 2.8 ? 2 : 1;
    const melee = rows === 2 ? clamp((w - 0.9) / 2, 0.9, 1.7) : clamp(w * 0.55, 0.8, 1.8);
    const step = (melee + 0.3) / ro;
    const span = Math.PI * 0.55;
    const count = Math.max(3, Math.floor(span / step));
    for (let row = 0; row < rows; row++) {
      const z = rows === 2 ? (row === 0 ? -1 : 1) * (melee / 2 + 0.15) : 0;
      for (let i = 0; i < count; i++) {
        const a = Math.PI / 2 + (i - (count - 1) / 2) * step;
        const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
        const origin: Vec3 = [radial[0] * (ro - melee * 0.12), radial[1] * (ro - melee * 0.12), z];
        gem(set.stone(code), frameFromUp(origin, radial, [0, 0, 1]), 'ROUND', melee);
        if (i < count - 1) {
          const b = a + step / 2;
          sphere(set.metal, [Math.cos(b) * ro, Math.sin(b) * ro, z + melee * 0.35], 0.22, 8);
          sphere(set.metal, [Math.cos(b) * ro, Math.sin(b) * ro, z - melee * 0.35], 0.22, 8);
        }
      }
    }
  } else if (main && setting) {
    const size = stoneSize(main, CENTER_STONE_MM);
    const gallery = 0.6;
    const girdleY = ro + size * 0.43 + size * 0.015 + gallery;
    const frame = frameFromUp([0, girdleY, 0], [0, 1, 0], [0, 0, 1]);
    setStone(set.metal, set.stone(main.code), frame, main, size, setting, girdleY - ro + t * 0.4, Math.min(w * 0.38, size * 0.3));
    hasHead = true;
  }

  accents.forEach((stone) => {
    const a = awayFromHead(stone.angle, hasHead);
    const size = stoneSize(stone, clamp(Math.min(w * 0.7, t * 1.3), 1.0, 2.6));
    const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const origin = scale(radial, ro - size * 0.1);
    const frame = frameFromUp(origin, radial, [0, 0, 1]);
    gem(set.stone(stone.code), frame, 'ROUND', size);
    // A thin bezel rim holds the flush-set stone.
    torus(set.metal, scale(radial, ro + 0.02), [0, 0, 1], norm(cross(radial, [0, 0, 1])), size / 2 + 0.16, 0.22, 24);
  });

  spec.elements.forEach((element) => {
    const a = awayFromHead(element.angle, hasHead);
    const size = clamp(w * 1.4, 3.5, 6);
    const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const tangent = norm(cross([0, 0, 1], radial));
    const frame: Frame = { origin: scale(radial, ro + 0.4), x: tangent, y: [0, 0, 1], z: radial };
    plaque(set.metal, frame, element.code, size, 0.9);
  });
}

/** Points along a closed curve, spaced evenly by arc length. */
function resampleClosed(curve: (u: number) => Vec3, count: number): { points: Vec3[]; length: number } {
  const dense = 2000;
  const samples: Vec3[] = [];
  const lengths = [0];
  for (let i = 0; i <= dense; i++) samples.push(curve(i / dense));
  for (let i = 1; i <= dense; i++) lengths.push(lengths[i - 1] + len(sub(samples[i], samples[i - 1])));
  const total = lengths[dense];
  const points: Vec3[] = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (j < dense && lengths[j] < target) j++;
    const span = lengths[j] - lengths[j - 1] || 1;
    points.push(lerp3(samples[j - 1], samples[j], (target - lengths[j - 1]) / span));
  }
  return { points, length: total };
}

/**
 * A cable chain along a closed curve in the XY plane: oval links, each turned a quarter turn
 * from the last so they interlock.
 */
function cableChain(metal: MeshBuilder, curve: (u: number) => Vec3, lengthMm: number): Vec3[] {
  const wire = 0.8;
  const linkLength = 4.4;
  const linkWidth = 3.1;
  const pitch = linkLength - 2 * wire;
  const count = Math.max(12, Math.round(lengthMm / pitch));
  const { points } = resampleClosed(curve, count);
  points.forEach((p, i) => {
    const next = points[(i + 1) % count];
    const prev = points[(i - 1 + count) % count];
    const tangent = norm(sub(next, prev));
    const inPlane = norm(cross([0, 0, 1], tangent));
    const side: Vec3 = i % 2 === 0 ? inPlane : [0, 0, 1];
    const a = (linkLength - wire) / 2;
    const b = (linkWidth - wire) / 2;
    const path: Vec3[] = [];
    for (let s = 0; s < 16; s++) {
      const u = (s / 16) * Math.PI * 2;
      path.push(add(p, add(scale(tangent, Math.cos(u) * a), scale(side, Math.sin(u) * b))));
    }
    tube(metal, path, wire / 2, 6, true);
  });
  return points;
}

/** A stone set in a bezel facing the viewer (+Z), centred on `centre`. */
function bezelStation(set: PartSet, stone: StoneSpec, centre: Vec3, size: number): void {
  const frame = frameFromUp(centre, [0, 0, 1], [0, 1, 0]);
  const outline = girdleOutline(stone.shape, size);
  gem(set.stone(stone.code), frame, stone.shape, size);
  bezelCup(set.metal, frame, outline, size, size * 0.3);
}

/** A charm hanging from `anchor` in direction `down` (unit, in the XY plane), facing +Z. */
function charm(set: PartSet, element: ElementSpec, anchor: Vec3, down: Vec3, size: number): void {
  const ring = 1.3;
  torus(set.metal, add(anchor, scale(down, ring)), down, [0, 0, 1], ring, 0.35, 20);
  const centre = add(anchor, scale(down, ring * 2 + size / 2));
  const frame: Frame = { origin: centre, x: norm(cross([0, 0, 1], down)), y: scale(down, -1), z: [0, 0, 1] };
  plaque(set.metal, frame, element.code, size, 1.0);
}

function chainPiece(spec: JewelrySpec, set: PartSet, curve: (u: number) => Vec3, lengthMm: number, bottom: Vec3, top: Vec3, centre: Vec3): void {
  cableChain(set.metal, curve, lengthMm);
  // Spring-ring clasp at the top.
  torus(set.metal, add(top, [0, 2.2, 0]), [1, 0, 0], [0, 1, 0], 2.2, 0.7, 28);

  const [main, ...others] = spec.stones;
  const down = norm(sub(bottom, centre));
  let elements = spec.elements;
  if (main) {
    const size = stoneSize(main, spec.itemType === 'NECKLACE' ? 6 : 5);
    torus(set.metal, add(bottom, scale(down, 1.6)), down, [0, 0, 1], 1.6, 0.5, 20);
    bezelStation(set, main, add(bottom, scale(down, 3.2 + size / 2 + 0.6)), size);
  } else if (elements.length) {
    charm(set, elements[0], bottom, down, spec.itemType === 'NECKLACE' ? 11 : 8);
    elements = elements.slice(1);
  }
  const pointAt = (angle: number) => {
    // Angles map onto the curve the way the studio places markers on its unit circle.
    let best = bottom;
    let bestDist = Infinity;
    const target: Vec3 = [Math.cos(angle), Math.sin(angle), 0];
    for (let i = 0; i < 360; i++) {
      const p = curve(i / 360);
      const d = len(sub(norm(sub(p, centre)), target));
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  };
  others.forEach((stone) => {
    const p = pointAt(stone.angle);
    bezelStation(set, stone, add(p, [0, 0, 1.2]), stoneSize(stone, 3));
  });
  elements.forEach((element) => {
    const p = pointAt(element.angle);
    charm(set, element, p, norm(sub(p, centre)), spec.itemType === 'NECKLACE' ? 8 : 6.5);
  });
}

function buildNecklace(spec: JewelrySpec, set: PartSet): void {
  const L = spec.necklace.lengthMm;
  // A hanging oval, 1.3× taller than wide, whose perimeter is the chain length (Ramanujan).
  const ratio = 1.3;
  const perimeter = (a: number) => {
    const b = a * ratio;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  };
  const a = L / perimeter(1);
  const b = a * ratio;
  const curve = (u: number): Vec3 => [Math.cos(u * Math.PI * 2 - Math.PI / 2) * a, Math.sin(u * Math.PI * 2 - Math.PI / 2) * b, 0];
  chainPiece(spec, set, curve, L, [0, -b, 0], [0, b, 0], [0, 0, 0]);
}

function buildBracelet(spec: JewelrySpec, set: PartSet): void {
  const C = spec.bracelet.innerCircumferenceMm;
  const r = C / (2 * Math.PI);
  const curve = (u: number): Vec3 => [Math.cos(u * Math.PI * 2 - Math.PI / 2) * r, Math.sin(u * Math.PI * 2 - Math.PI / 2) * r, 0];
  chainPiece(spec, set, curve, C, [0, -r, 0], [0, r, 0], [0, 0, 0]);
}

function buildEarring(spec: JewelrySpec, set: PartSet, offsetX: number): void {
  const [main, second] = spec.stones;
  const element = spec.elements[0];
  const base: Vec3 = [offsetX, 0, 0];
  if (spec.earrings.style === 'stud') {
    // Post behind the face, then a stone in prongs, a shaped plaque, or a polished dome.
    tube(set.metal, [add(base, [0, 0, -0.5]), add(base, [0, 0, -11])], 0.45, 10, false);
    if (main) {
      const size = stoneSize(main, 5);
      const frame = frameFromUp(add(base, [0, 0, size * 0.43 + 0.8]), [0, 0, 1], [0, 1, 0]);
      setStone(set.metal, set.stone(main.code), frame, main, size, spec.setting ?? '4_PRONG', size * 0.43 + 1.2, size * 0.3);
      if (second) {
        // A halo of the second stone around the centre stone.
        const melee = clamp(size * 0.22, 0.9, 1.6);
        const reach = size / 2 + melee / 2 + 0.35;
        const count = Math.max(8, Math.floor((2 * Math.PI * reach) / (melee + 0.25)));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const origin = add(base, [Math.cos(a) * reach, Math.sin(a) * reach, 0.6]);
          gem(set.stone(second.code), frameFromUp(origin, [0, 0, 1], [0, 1, 0]), 'ROUND', melee);
        }
        torus(set.metal, add(base, [0, 0, 0.3]), [1, 0, 0], [0, 1, 0], reach, melee * 0.5, 48);
      }
    } else if (element) {
      plaque(set.metal, { origin: add(base, [0, 0, 0.5]), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, element.code, 8, 1.2);
    } else {
      // A polished metal ball.
      sphere(set.metal, add(base, [0, 0, 0.4]), 3, 24);
    }
    return;
  }

  // Drop: ear wire, jump ring, then the stone and / or shape hanging below.
  const hook: Vec3[] = smoothPath(
    [add(base, [0, 2.5, 0]), add(base, [0, 9, 1]), add(base, [0, 14, -3]), add(base, [0, 11, -9]), add(base, [0, 4, -11])],
    8,
  );
  tube(set.metal, hook, 0.42, 8, false);
  torus(set.metal, add(base, [0, 1.3, 0]), [0, 1, 0], [0, 0, 1], 1.3, 0.4, 20);
  let y = 0;
  if (main) {
    const size = stoneSize(main, 6);
    bezelStation(set, main, add(base, [0, -(size / 2 + 1.4), 0]), size);
    y = -(size + 2.2);
  }
  if (element) {
    if (main) torus(set.metal, add(base, [0, y - 1.1, 0]), [0, 1, 0], [0, 0, 1], 1.1, 0.35, 20);
    const anchor = main ? y - 2.2 : 0;
    plaque(set.metal, { origin: add(base, [0, anchor - 5, 0]), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, element.code, 9, 1.2);
  } else if (!main) {
    // A polished metal teardrop.
    const tear: Point2[] = [];
    for (let i = 0; i <= 20; i++) {
      const tt = (i / 20) * Math.PI;
      tear.push([Math.sin(tt) * 3.4 * Math.pow(Math.sin(tt / 2), 0.6), Math.cos(tt) * 5.5]);
    }
    revolve(set.metal, tear, 32, 'Y', add(base, [0, -7, 0]), false, [0, 0]);
  }
}

function buildEarrings(spec: JewelrySpec, set: PartSet): void {
  buildEarring(spec, set, -11);
  buildEarring(spec, set, 11);
}

/** Builds the piece a spec describes. Deterministic: the same spec gives the same mesh. */
export function buildJewelry(spec: JewelrySpec): JewelryModel {
  const set = new PartSet();
  if (spec.itemType === 'NECKLACE') buildNecklace(spec, set);
  else if (spec.itemType === 'BRACELET') buildBracelet(spec, set);
  else if (spec.itemType === 'EARRINGS') buildEarrings(spec, set);
  else buildRing(spec, set);
  return { spec, parts: set.parts(spec.metalCode) };
}

/** Axis-aligned bounds of a model. */
export function modelBounds(model: JewelryModel): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  model.parts.forEach((part) => {
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
  });
  return { min, max };
}
