/**
 * Parametric jewelry geometry: the one source of truth for what a design looks like.
 *
 * The server builds STL exports and rendered pictures from it, and the app's 3D studio runs the
 * same code (transpiled into the viewer by `app/scripts/sync-jewelry-geometry.cjs`, together with
 * the catalogue and the motifs), so the preview, the picture and the manufacturing file show the
 * same piece.
 *
 * Units are millimetres. Y is up. A ring stands with its finger hole facing +Z (toward the
 * viewer) and its band's top on +Y. Necklaces, bracelets and earrings lie in the XY plane, facing
 * +Z. Imports are limited to the catalogue and the motifs, which are embedded with this file.
 */

import {
  BAND_STONE_SIZES_MM,
  CutCode,
  LEGACY_SETTINGS,
  MAX_ROTATION_DEG,
  RING_TOP_DEG,
  STONES,
  STONE_PALETTE,
  ShankStyle,
  allowedCuts,
  bandMetalThicknessMm,
  bandWallMm,
  cutDef,
  elementDef,
  elementText,
  paletteColor,
  settingDef,
  shankStyleOf,
  stoneDef,
} from './catalog';
import { MotifOutline, P2, densifyLoop, motifOutline, triangulate } from './motifs';

export type Vec3 = [number, number, number];

export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

export type ItemTypeCode = 'RING' | 'NECKLACE' | 'BRACELET' | 'EARRINGS';
/** A head (centre stone) code from the catalogue. */
export type SettingCode = string;
export type StoneShape = CutCode;
export type ElementCode = string;

/** Where an item sits: the angle on the piece, how far across the band, and its own turn. */
export interface ItemPlacement {
  /** Radians on the piece (0 = right, PI/2 = top). */
  angle: number;
  /** Across a ring band (along the finger), or for earrings the distance from the centre (mm). */
  offsetMm: number;
  /** Turn about the item's own centre (degrees). */
  rotationDeg: number;
  /** The user placed it (an angle was saved), rather than the old automatic seats. */
  placed: boolean;
}

export interface StoneSpec extends ItemPlacement {
  code: string;
  shape: CutCode;
  /** A colour of the client's chart. */
  color: string;
  opaque: boolean;
  /** Girdle diameter (longest side for oval / emerald cuts); null = the default for its role. */
  sizeMm: number | null;
}

export interface ElementSpec extends ItemPlacement {
  /** A catalogue element, 'INITIAL' (an older round initial plaque) or 'CUSTOM' (an uploaded picture). */
  code: ElementCode;
  text: string;
  variant: string;
  /** The longest side (mm); null = the default for its role. */
  sizeMm: number | null;
}

/** A band setting: a row of stones along the ring band. */
export interface BandSpec {
  code: string;
  stoneCode: string;
  color: string;
  opaque: boolean;
  /** Stone diameter (1–4 mm, the pavé table). */
  stoneMm: number;
  rows: number;
  /** Stones per row. */
  count: number;
  /** The row's centre on the band (radians). */
  angle: number;
}

export interface JewelrySpec {
  itemType: ItemTypeCode;
  metalCode: string;
  purityCode: string;
  finishCode: string;
  /** `shankStyle`: one band, a split shank, or two / three bands side by side (notes of 23.11). */
  ring: { innerDiameterMm: number; bandWidthMm: number; bandThicknessMm: number; shankStyle: ShankStyle };
  necklace: { lengthMm: number };
  bracelet: { innerCircumferenceMm: number };
  earrings: { style: 'stud' | 'drop' };
  /** The centre stone's head, or null (no centre head). */
  setting: SettingCode | null;
  /** Prongs of a prong head (older 6-prong designs keep their six). */
  prongs: number;
  band: BandSpec | null;
  stones: StoneSpec[];
  elements: ElementSpec[];
}

export interface JewelryPart {
  material: 'metal' | 'stone';
  /** Metal code, or the stone's chart colour code: picks the colour. */
  code: string;
  /** Stones that let no light through (opal, lapis lazuli…). */
  opaque?: boolean;
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

/** Stone colours: every chart colour, and each stone's code for its starting colour. */
export const STONE_COLORS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  STONE_PALETTE.forEach((c) => {
    out[c.code] = c.hex;
  });
  STONES.forEach((s) => {
    if (!out[s.code]) out[s.code] = paletteColor(s.defaultColor)?.hex ?? '#DDE3FF';
  });
  return out;
})();

export const DEFAULT_RING_INNER_DIAMETER_MM = 17.35;
export const DEFAULT_BAND_WIDTH_MM = 3;
export const DEFAULT_NECKLACE_LENGTH_CM = 45;
export const DEFAULT_WRIST_CM = 16.5;
/**
 * Most stones / decorative elements one piece is built with. The server refuses more (they bound
 * the mesh, so a crafted design cannot exhaust memory).
 */
export const MAX_STONES = 12;
export const MAX_ELEMENTS = 6;
/** Most stones in one row of a band setting. */
export const MAX_BAND_STONES = 60;
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

const DEG = Math.PI / 180;

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

/** The angle on the piece of an older studio placement ({x, y} on a unit circle). */
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

/**
 * A saved placement: `angleDeg` (where the user put the item), `offsetMm` and `rotationDeg`; an
 * older placement (a point on a unit circle) keeps its angle.
 */
function readPlacement(placement: unknown, fallbackIndex: number): ItemPlacement {
  const p = record(placement);
  const deg = finite(p?.angleDeg);
  const offsetMm = clamp(finite(p?.offsetMm) ?? 0, -50, 50);
  const rotationDeg = clamp(finite(p?.rotationDeg) ?? 0, -MAX_ROTATION_DEG, MAX_ROTATION_DEG);
  if (deg != null) return { angle: deg * DEG, offsetMm, rotationDeg, placed: true };
  return { angle: placementAngle(placement, fallbackIndex), offsetMm, rotationDeg, placed: false };
}

function upper(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function stoneColor(stoneCode: string, colorCode: unknown): string {
  const chosen = paletteColor(upper(colorCode));
  if (chosen) return chosen.code;
  return stoneDef(stoneCode)?.defaultColor ?? 'CRYSTAL';
}

function readStone(s: Record<string, unknown>, index: number): StoneSpec | null {
  if (typeof s.stoneCode !== 'string' || !s.stoneCode) return null;
  const code = s.stoneCode;
  const cuts = allowedCuts(code);
  const asked = upper(s.cutCode) || upper(s.shape);
  const shape = (cuts as string[]).includes(asked) ? (asked as CutCode) : cuts[0];
  const sizeMm = finite(s.sizeMm);
  return {
    code,
    shape,
    color: stoneColor(code, s.colorCode),
    opaque: stoneDef(code)?.opaque ?? false,
    sizeMm: sizeMm != null && sizeMm >= 0.8 && sizeMm <= 25 ? sizeMm : null,
    ...readPlacement(s.placement, index),
  };
}

/** Snaps a band stone size to the pavé table's sizes (1–4 mm). */
function bandStoneSize(value: number): number {
  let best = BAND_STONE_SIZES_MM[0];
  BAND_STONE_SIZES_MM.forEach((s) => {
    if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  });
  return best;
}

/** How many stones of `stoneMm` fit around a whole ring of outer radius `ro`. */
function bandStonesAround(ro: number, stoneMm: number, gap: number): number {
  return Math.max(1, Math.floor((2 * Math.PI * ro) / (stoneMm + gap)));
}

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
  const shankStyle: ShankStyle = kind === 'RING' ? shankStyleOf(size.shankStyle) : 'SINGLE';
  let stones: StoneSpec[] = [];
  if (Array.isArray(params.stones)) {
    params.stones.slice(0, MAX_STONES).forEach((item, index) => {
      const s = record(item);
      const stone = s ? readStone(s, index) : null;
      if (stone) stones.push(stone);
    });
  }
  const elements: ElementSpec[] = [];
  if (Array.isArray(params.elements)) {
    params.elements.slice(0, MAX_ELEMENTS).forEach((item, index) => {
      const e = record(item);
      if (!e) return;
      const raw = upper(e.elementCode);
      const custom = typeof e.customUploadId === 'string' && !!e.customUploadId;
      if (!raw && !custom) return;
      let def = raw === 'INITIAL' ? null : elementDef(raw);
      // A letters / numbers element without its text (from an app version before texts): the round
      // initial plaque those versions offered.
      if (def?.text && e.text === undefined) def = null;
      const code = def ? def.code : raw === 'INITIAL' || elementDef(raw)?.text ? 'INITIAL' : 'CUSTOM';
      const sizeMm = finite(e.sizeMm);
      elements.push({
        code,
        text: elementText(def, e.text),
        variant: def && typeof e.variant === 'string' && def.variants.includes(e.variant) ? e.variant : def?.variants[0] ?? '',
        sizeMm: sizeMm != null && def ? clamp(sizeMm, def.minMm, def.maxMm) : sizeMm != null ? clamp(sizeMm, 2, 30) : null,
        ...readPlacement(e.placement, index),
      });
    });
  }

  // The head: `headCode`, or the older `settingCode` (4 / 6 prongs = a basket head).
  const headAsked = upper(setting?.headCode) || upper(setting?.settingCode);
  let head: string | null = null;
  let prongs = 4;
  const legacy = LEGACY_SETTINGS[headAsked];
  if (legacy) {
    head = legacy.code;
    prongs = legacy.prongs ?? 4;
  } else if (settingDef(headAsked)?.kind === 'HEAD') {
    head = settingDef(headAsked)!.code;
  }

  // The band setting: `setting.band`, or an older design's "PAVE" setting, which set the band
  // with its first stone's kind.
  let band: BandSpec | null = null;
  const ri = ringInnerDiameterMm(size.standard, size.sizeCode, lookups.ringChartDiameterMm) / 2;
  const bandRecord = record(setting?.band);
  const bandAsked = bandRecord ? upper(bandRecord.settingCode) : settingDef(headAsked)?.kind === 'BAND' ? headAsked : '';
  const bandDef = settingDef(bandAsked);
  // A split shank's arms carry no row of stones (the server refuses the two together).
  if (kind === 'RING' && bandDef?.kind === 'BAND' && shankStyle !== 'SPLIT') {
    let stoneCode = 'DIAMOND';
    let color: unknown = null;
    let stoneMm: number;
    let rows: number;
    let count: number | null = null;
    let angle = RING_TOP_DEG * DEG;
    if (bandRecord) {
      stoneCode = stoneDef(bandRecord.stoneCode)?.code ?? 'DIAMOND';
      color = bandRecord.colorCode;
      stoneMm = bandStoneSize(finite(bandRecord.stoneSizeMm) ?? 1.5);
      rows = clamp(Math.round(finite(bandRecord.rows) ?? bandDef.minRows), bandDef.minRows, bandDef.maxRows);
      const c = finite(bandRecord.count);
      count = c != null ? Math.round(c) : null;
      const deg = finite(record(bandRecord.placement)?.angleDeg);
      if (deg != null) angle = deg * DEG;
    } else {
      // Older pavé: the first stone's kind, sized by the band (two rows on a wide band).
      if (stones[0]) stoneCode = stones[0].code;
      color = stones[0]?.color;
      stones = stones.slice(1);
      rows = bandWidth >= 2.8 ? 2 : 1;
      stoneMm = bandStoneSize(rows === 2 ? clamp((bandWidth - 0.9) / 2, 1, 1.75) : clamp(bandWidth * 0.55, 1, 1.75));
      if (bandDef.minRows > rows) rows = bandDef.minRows;
    }
    const ro = ri + Math.max(bandThicknessMm(bandWidth), bandMetalThicknessMm(stoneMm));
    const most = bandStonesAround(ro, stoneMm, 0.3);
    const auto = Math.max(3, Math.floor((Math.PI * 0.55 * ro) / (stoneMm + 0.3)));
    band = {
      code: bandDef.code,
      stoneCode,
      color: stoneColor(stoneCode, color),
      opaque: stoneDef(stoneCode)?.opaque ?? false,
      stoneMm,
      rows,
      count: clamp(count ?? auto, 1, Math.min(MAX_BAND_STONES, most)),
      angle,
    };
  }
  if (headAsked === 'NONE') head = null;
  // A ring's first stone stands in a basket head unless another head (or none) is chosen. A band
  // setting holds its own small stones, so it does not take the head away; only an older pavé
  // design (the setting itself was the band, made of its first stone) keeps its stones flush.
  else if (kind === 'RING' && !head && !(bandDef && !bandRecord) && stones.length) head = 'BASKET';

  const style = typeof size.earringStyleCode === 'string' && size.earringStyleCode.toLowerCase() === 'drop' ? 'drop' : 'stud';
  const thickness = Math.max(bandThicknessMm(bandWidth), band ? bandMetalThicknessMm(band.stoneMm) : 0);

  return {
    itemType: kind,
    metalCode: typeof metal.metalCode === 'string' ? metal.metalCode : 'YELLOW_GOLD',
    purityCode: typeof metal.purityCode === 'string' ? metal.purityCode : '14K',
    finishCode: typeof params.finishCode === 'string' ? params.finishCode : 'POLISHED',
    ring: { innerDiameterMm: ri * 2, bandWidthMm: bandWidth, bandThicknessMm: thickness, shankStyle },
    necklace: { lengthMm: clamp(finite(size.necklaceLengthCm) ?? DEFAULT_NECKLACE_LENGTH_CM, 20, 100) * 10 },
    bracelet: {
      innerCircumferenceMm: clamp(finite(size.wristCircumferenceCm) ?? DEFAULT_WRIST_CM, 10, 30) * 10 + BRACELET_EASE_MM,
    },
    earrings: { style },
    setting: head,
    prongs,
    band,
    stones,
    elements,
  };
}

/**
 * The placement of the item under a point on the piece (the studio drags items on the model): the
 * angle on the piece and, on a ring, how far across the band; on earrings, the distance from the
 * stud.
 */
export function placementFromPoint(spec: JewelrySpec, point: Vec3): { angleDeg: number; offsetMm: number } {
  const round = (v: number) => Math.round(v * 10) / 10;
  if (spec.itemType === 'EARRINGS') {
    const cx = point[0] < 0 ? -11 : 11;
    const dx = point[0] - cx;
    const dy = point[1];
    return { angleDeg: round(Math.atan2(dy, dx) / DEG), offsetMm: round(Math.hypot(dx, dy)) };
  }
  let deg = Math.atan2(point[1], point[0]) / DEG;
  if (deg < 0) deg += 360;
  if (spec.itemType === 'RING') {
    const half = ringHalfWidthMm(spec);
    return { angleDeg: round(deg), offsetMm: round(clamp(point[2], -half, half)) };
  }
  return { angleDeg: round(deg), offsetMm: 0 };
}

// ---------------------------------------------------------------------------------------------
// The shank (the client's notes of 23.11: split, double and triple shanks)
// ---------------------------------------------------------------------------------------------

/** Where a ring's head stands: where the user put the centre stone, else the top. */
function headAngleOf(spec: JewelrySpec): number {
  const main = spec.stones[0];
  return spec.setting && main?.placed ? main.angle : RING_TOP_DEG * DEG;
}

/** The gap between two bands of a double / triple shank. */
function shankGapMm(bandWidthMm: number): number {
  return clamp(bandWidthMm * 0.5, 0.8, 2.5);
}

/** The middle (z) of each band of the shank: one band, or two / three side by side. */
export function shankCentresMm(spec: JewelrySpec): number[] {
  const w = spec.ring.bandWidthMm;
  const step = w + shankGapMm(w);
  if (spec.ring.shankStyle === 'DOUBLE') return [-step / 2, step / 2];
  if (spec.ring.shankStyle === 'TRIPLE') return [-step, 0, step];
  return [0];
}

/**
 * A split shank: each arm's width, where the arms lie while the band is whole (they overlap into
 * one band of the chosen width), how far apart they move at the top, and over what arc they part.
 */
function splitShank(spec: JewelrySpec): { armWidth: number; base: number; spread: number; spanRad: number } {
  const w = spec.ring.bandWidthMm;
  const armWidth = Math.max(0.8, w * 0.6);
  // The opening at the top: about half the centre stone, never less than 1.4 mm.
  const centre = spec.stones[0] && spec.setting ? spec.stones[0].sizeMm ?? CENTER_STONE_MM : CENTER_STONE_MM;
  const opening = Math.max(1.4, centre * 0.5);
  const base = w / 2 - armWidth / 2;
  return { armWidth, base, spread: opening / 2 - (w / 2 - armWidth), spanRad: 75 * DEG };
}

/** How far the arms of a split shank have parted at `angle` (0 at the bottom, 1 at the top). */
function splitAmount(angle: number, top: number, spanRad: number): number {
  const d = Math.abs(Math.atan2(Math.sin(angle - top), Math.cos(angle - top)));
  const x = clamp(1 - d / spanRad, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Half the ring's width across the finger at its widest (all its bands, a split shank's open arms). */
export function ringHalfWidthMm(spec: JewelrySpec): number {
  const w = spec.ring.bandWidthMm;
  if (spec.ring.shankStyle === 'SPLIT') {
    const s = splitShank(spec);
    return s.base + s.spread + s.armWidth / 2;
  }
  const centres = shankCentresMm(spec);
  return Math.max(...centres.map(Math.abs)) + w / 2;
}

/**
 * Where across the band (z) an item `halfMm` wide sits at `angle`, as near `z` as the metal allows:
 * on a band (or an arm), never in the gap between two.
 */
function onShank(spec: JewelrySpec, angle: number, z: number, halfMm: number): number {
  const w = spec.ring.bandWidthMm;
  let strips: Array<{ c: number; half: number }>;
  if (spec.ring.shankStyle === 'SPLIT') {
    const s = splitShank(spec);
    const c = s.base + s.spread * splitAmount(angle, headAngleOf(spec), s.spanRad);
    // While the arms overlap they are one band.
    strips = c - s.armWidth / 2 <= 0 ? [{ c: 0, half: c + s.armWidth / 2 }] : [-c, c].map((x) => ({ c: x, half: s.armWidth / 2 }));
  } else {
    strips = shankCentresMm(spec).map((c) => ({ c, half: w / 2 }));
  }
  let best = strips[0];
  strips.forEach((strip) => {
    if (Math.abs(z - strip.c) < Math.abs(z - best.c)) best = strip;
  });
  const room = Math.max(0, best.half - halfMm);
  return best.c + clamp(z - best.c, -room, room);
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

/** The frame turned about its own Y axis by `deg`. */
function turnFrame(f: Frame, deg: number): Frame {
  if (!deg) return f;
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { origin: f.origin, y: f.y, x: add(scale(f.x, c), scale(f.z, s)), z: add(scale(f.z, c), scale(f.x, -s)) };
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

/** Outward 2D normals of a closed or open polyline, pointing away from `centre`. */
function profileNormals(points: P2[], closed: boolean, centre: P2): P2[] {
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
 * `fromAngle` / `toAngle` revolve only part of the way (with flat ends).
 */
function revolve(
  mesh: MeshBuilder,
  profile: P2[],
  segments: number,
  axis: 'Y' | 'Z',
  origin: Vec3,
  closed: boolean,
  profileCentre?: P2,
  fromAngle = 0,
  toAngle = Math.PI * 2,
): void {
  const centre: P2 =
    profileCentre ??
    [profile.reduce((s, p) => s + p[0], 0) / profile.length, profile.reduce((s, p) => s + p[1], 0) / profile.length];
  const normals2 = profileNormals(profile, closed, centre);
  const full = Math.abs(toAngle - fromAngle - Math.PI * 2) < 1e-9;
  const at = (p: P2, t: number): Vec3 => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return add(origin, axis === 'Z' ? [p[0] * c, p[0] * s, p[1]] : [p[0] * c, p[1], p[0] * s]);
  };
  const rows: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = fromAngle + ((toAngle - fromAngle) * i) / segments;
    const c = Math.cos(t);
    const s = Math.sin(t);
    rows.push(
      profile.map((p, j) => {
        const n = normals2[j];
        const normal: Vec3 = axis === 'Z' ? [n[0] * c, n[0] * s, n[1]] : [n[0] * c, n[1], n[0] * s];
        return mesh.vertex(at(p, t), normal);
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
  if (!full && closed) {
    // Flat ends of a part-way revolution.
    [fromAngle, toAngle].forEach((t, k) => {
      const tangent: Vec3 = axis === 'Z' ? [-Math.sin(t), Math.cos(t), 0] : [-Math.sin(t), 0, Math.cos(t)];
      mesh.flatPolygon(profile.map((p) => at(p, t)), k === 0 ? scale(tangent, -1) : tangent);
    });
  }
}

/** A rounded rectangle section (counter-clockwise) for the ring band, `steps` points per corner. */
function roundedRect(r0: number, r1: number, h0: number, h1: number, corner: number, steps: number): P2[] {
  const c = Math.min(corner, (r1 - r0) / 2, (h1 - h0) / 2);
  const corners: Array<[number, number, number]> = [
    [r1 - c, h0 + c, -Math.PI / 2],
    [r1 - c, h1 - c, 0],
    [r0 + c, h1 - c, Math.PI / 2],
    [r0 + c, h0 + c, Math.PI],
  ];
  const points: P2[] = [];
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

/** A box in a frame: centre and half sizes in the frame's axes. */
function box(mesh: MeshBuilder, f: Frame, centre: Vec3, half: Vec3): void {
  const c = (sx: number, sy: number, sz: number) => toWorld(f, [centre[0] + sx * half[0], centre[1] + sy * half[1], centre[2] + sz * half[2]]);
  const faces: Array<[Vec3, Vec3[]]> = [
    [f.x, [c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)]],
    [scale(f.x, -1), [c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1)]],
    [f.y, [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)]],
    [scale(f.y, -1), [c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1)]],
    [f.z, [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)]],
    [scale(f.z, -1), [c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1), c(1, -1, -1)]],
  ];
  faces.forEach(([n, pts]) => mesh.flatPolygon(pts, n));
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

function isCabochon(shape: CutCode): boolean {
  return shape === 'CABOCHON' || shape === 'CABOCHON_OVAL';
}

/** The first cuts, drawn as they always were (their depth follows the length). */
const FIRST_CUTS: readonly CutCode[] = ['ROUND', 'OVAL', 'EMERALD', 'ROSE', 'CABOCHON', 'CABOCHON_OVAL'];

/**
 * Heights of a cut above and below its girdle. The first cuts as fractions of their size; the
 * fancy shapes (23.11) of their width, so a baguette or a marquise is as deep as it is wide.
 */
function cutProfile(shape: CutCode, size: number): { crown: number; girdle: number; pavilion: number } {
  if (isCabochon(shape)) return { crown: size * 0.42, girdle: size * 0.03, pavilion: 0 };
  if (shape === 'ROSE') return { crown: size * 0.3, girdle: size * 0.03, pavilion: 0 };
  const depth = FIRST_CUTS.includes(shape) ? size : size * (cutDef(shape)?.widthRatio ?? 1);
  return { crown: depth * 0.16, girdle: size * 0.03, pavilion: depth * 0.43 };
}

/** A rectangle hx × hz with its corners cut by `cut` (0: square corners). */
function cutRect(hx: number, hz: number, cut: number): P2[] {
  if (cut <= 0) {
    return [
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
      [-hx, -hz],
    ];
  }
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

/** Scales points about their bounding box's middle to `size` long (x) and `size × ratio` wide (z). */
function fitOutline(points: P2[], size: number, ratio: number): P2[] {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  const w = Math.max(...xs) - Math.min(...xs) || 1;
  const h = Math.max(...zs) - Math.min(...zs) || 1;
  return points.map(([x, z]) => [((x - cx) / w) * size, ((z - cz) / h) * size * ratio]);
}

/** The fancy shapes' girdles (the client's notes of 23.11), or null for the first cuts. */
function fancyOutline(shape: StoneShape, size: number): P2[] | null {
  const r = size / 2;
  switch (shape) {
    case 'PRINCESS':
      return cutRect(r, r, r * 0.04);
    case 'ASSCHER':
      return cutRect(r, r, r * 0.3);
    case 'RADIANT':
      return cutRect(r, r * 0.8, r * 0.16);
    case 'BAGUETTE':
      return cutRect(r, r * 0.35, 0);
    case 'CUSHION': {
      // A square with softly rounded sides (a superellipse).
      const pts: P2[] = [];
      for (let i = 0; i < 32; i++) {
        const t = (i / 32) * Math.PI * 2;
        const c = Math.cos(t);
        const s = Math.sin(t);
        pts.push([Math.sign(c) * r * Math.pow(Math.abs(c), 2 / 3.2), Math.sign(s) * r * 0.95 * Math.pow(Math.abs(s), 2 / 3.2)]);
      }
      return pts;
    }
    case 'MARQUISE': {
      // Pointed at both ends, half as wide as long.
      const pts: P2[] = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const x = r - (2 * r * i) / n;
        pts.push([x, r * 0.5 * (1 - (x / r) ** 2)]);
      }
      for (let i = n - 1; i > 0; i--) {
        const x = r - (2 * r * i) / n;
        pts.push([x, -r * 0.5 * (1 - (x / r) ** 2)]);
      }
      return pts;
    }
    case 'PEAR': {
      // A teardrop: the point at one end, round at the other.
      const pts: P2[] = [];
      for (let i = 0; i < 28; i++) {
        const t = (i / 28) * Math.PI * 2;
        pts.push([Math.cos(t), Math.sin(t) * Math.sin(t / 2)]);
      }
      return fitOutline(pts, size, 0.62);
    }
    case 'HEART': {
      const pts: P2[] = [];
      for (let i = 0; i < 32; i++) {
        const t = (i / 32) * Math.PI * 2;
        pts.push([13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t), 16 * Math.sin(t) ** 3]);
      }
      return fitOutline(pts, size, 1);
    }
    case 'TRILLION': {
      // A triangle with gently rounded sides.
      const corners: P2[] = [0, 1, 2].map((k) => {
        const a = Math.PI / 2 + (k * 2 * Math.PI) / 3;
        return [Math.cos(a), Math.sin(a)];
      });
      const pts: P2[] = [];
      for (let k = 0; k < 3; k++) {
        const a = corners[k];
        const b = corners[(k + 1) % 3];
        const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const out = Math.hypot(mid[0], mid[1]) || 1;
        for (let s = 0; s < 6; s++) {
          const u = s / 6;
          const bulge = Math.sin(Math.PI * u) * 0.12;
          pts.push([a[0] + (b[0] - a[0]) * u + (mid[0] / out) * bulge, a[1] + (b[1] - a[1]) * u + (mid[1] / out) * bulge]);
        }
      }
      return fitOutline(pts, size, 0.87);
    }
    default:
      return null;
  }
}

/** Girdle outline (x, z) of a cut, scaled so its longest side equals `size`. */
function girdleOutline(shape: StoneShape, size: number): P2[] {
  const fancy = fancyOutline(shape, size);
  if (fancy) return fancy;
  const r = size / 2;
  if (shape === 'OVAL' || shape === 'CABOCHON_OVAL') {
    const pts: P2[] = [];
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
  const n = shape === 'CABOCHON' ? 24 : 16;
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Distance from the outline's centre to its edge in direction `angle` (in the outline's plane). */
function outlineReach(outline: P2[], angle: number): number {
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
 * A gemstone, table up (+Y in its frame), girdle centred on the frame origin. Faceted cuts follow a
 * round brilliant (table 56 %, crown 16 %, girdle 3 %, pavilion 43 % of the diameter); a rose cut
 * has a flat base and a faceted dome; a cabochon a smooth dome on a flat base.
 */
function gem(mesh: MeshBuilder, frame: Frame, shape: StoneShape, size: number): void {
  const outline = girdleOutline(shape, size);
  const { crown, girdle, pavilion } = cutProfile(shape, size);
  const centre = frame.origin;
  const count = outline.length;
  const upper = outline.map(([x, z]) => toWorld(frame, [x, girdle / 2, z]));
  const lower = outline.map(([x, z]) => toWorld(frame, [x, -girdle / 2, z]));
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const girdleMid = scale(add(add(upper[i], upper[j]), add(lower[i], lower[j])), 0.25);
    mesh.flatPolygon([upper[i], lower[i], lower[j], upper[j]], sub(girdleMid, centre));
  }
  if (isCabochon(shape)) {
    // Smooth dome: rings of the outline shrinking toward the top, ellipsoid normals.
    const rings = 7;
    const rx = size / 2;
    const rz = shape === 'CABOCHON_OVAL' ? rx * 0.72 : rx;
    const ids: number[][] = [];
    for (let k = 0; k <= rings; k++) {
      const phi = (k / rings) * (Math.PI / 2);
      const s = Math.cos(phi);
      const y = girdle / 2 + Math.sin(phi) * crown;
      ids.push(
        outline.map(([x, z]) => {
          const p: Vec3 = [x * s, y, z * s];
          const n: Vec3 = [p[0] / (rx * rx), (y - girdle / 2) / (crown * crown), p[2] / (rz * rz)];
          return mesh.vertex(toWorld(frame, p), dirToWorld(frame, norm(n)));
        }),
      );
    }
    for (let k = 0; k < rings; k++) {
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        mesh.quad(ids[k][i], ids[k + 1][i], ids[k + 1][j], ids[k][j]);
      }
    }
    mesh.flatPolygon(lower, scale(frame.y, -1));
    return;
  }
  if (shape === 'ROSE') {
    // Flat base, a ring of facets and a crown of triangles to the apex.
    const mid = outline.map(([x, z], i) => {
      const a = (Math.PI * 2 * (i + 0.5)) / count;
      const r = Math.hypot(x, z) * 0.6;
      return toWorld(frame, [Math.cos(a) * r, girdle / 2 + crown * 0.62, Math.sin(a) * r]);
    });
    const apex = toWorld(frame, [0, girdle / 2 + crown, 0]);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const m1 = scale(add(add(upper[i], upper[j]), mid[i]), 1 / 3);
      mesh.flatPolygon([upper[i], upper[j], mid[i]], sub(m1, centre));
      const m2 = scale(add(add(mid[i], mid[(i - 1 + count) % count]), upper[i]), 1 / 3);
      mesh.flatPolygon([upper[i], mid[i], mid[(i - 1 + count) % count]], sub(m2, centre));
      const m3 = scale(add(add(mid[i], mid[j]), apex), 1 / 3);
      mesh.flatPolygon([mid[i], mid[j], apex], sub(m3, centre));
    }
    mesh.flatPolygon(lower, scale(frame.y, -1));
    return;
  }
  const top = outline.map(([x, z]) => toWorld(frame, [x * 0.56, girdle / 2 + crown, z * 0.56]));
  const culet = toWorld(frame, [0, -girdle / 2 - pavilion, 0]);
  if (shape === 'HEART') {
    // The heart's table has a cleft: fanned from its middle, not from a corner.
    const middle = toWorld(frame, [0, girdle / 2 + crown, 0]);
    for (let i = 0; i < count; i++) mesh.flatPolygon([middle, top[i], top[(i + 1) % count]], frame.y);
  } else {
    mesh.flatPolygon(top, frame.y);
  }
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const crownMid = scale(add(add(top[i], top[j]), add(upper[i], upper[j])), 0.25);
    mesh.flatPolygon([top[i], upper[i], upper[j], top[j]], sub(crownMid, centre));
    const pavMid = scale(add(add(lower[i], lower[j]), culet), 1 / 3);
    mesh.flatPolygon([lower[i], culet, lower[j]], sub(pavMid, centre));
  }
}

function stoneSize(stone: StoneSpec | undefined, fallback: number): number {
  return stone?.sizeMm ?? fallback;
}

// ---------------------------------------------------------------------------------------------
// Heads (the centre stone's setting)
// ---------------------------------------------------------------------------------------------

/** Offsets a convex outline outward by `d` (negative shrinks). */
function offsetOutline(outline: P2[], d: number): P2[] {
  return outline.map(([x, z]) => {
    const r = Math.hypot(x, z) || 1;
    return [x + (x / r) * d, z + (z / r) * d];
  });
}

interface HeadInput {
  metal: MeshBuilder;
  frame: Frame;
  shape: CutCode;
  outline: P2[];
  size: number;
  /** How far below the girdle the head reaches into what it stands on. */
  baseDepth: number;
  baseSpread: number;
  prongs: number;
  /** The small stone a bridge-accent head carries. */
  accent: MeshBuilder;
  /**
   * A ring's head sits on the band (the client's notes of 23.11: "at height 0, the prongs come
   * straight out of the ring"): the prongs rise from the band's surface beside the stone, no more
   * than this far across the band (its half width, less the wire).
   */
  onBand?: { halfWidth: number };
}

/** Prongs from the base to over the girdle; `cross` turns their bases (a trellis), `peg` joins them in one post. */
function prongSet(h: HeadInput, opts: { cross?: boolean; peg?: boolean } = {}): number {
  const { metal, frame, outline, size, baseDepth, baseSpread, prongs } = h;
  const { crown, pavilion } = cutProfile(h.shape, size);
  const wire = clamp(size * 0.085, 0.32, 0.6);
  const below = Math.max(pavilion, size * 0.25);
  for (let k = 0; k < prongs; k++) {
    const a = (k / prongs) * Math.PI * 2 + Math.PI / prongs;
    const reach = outlineReach(outline, a);
    const dir: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    const baseAngle = opts.cross ? a + Math.PI / prongs : a;
    const baseDir: Vec3 = [Math.cos(baseAngle), 0, Math.sin(baseAngle)];
    let base: Vec3 = opts.peg ? [0, -baseDepth, 0] : add([0, -baseDepth, 0], scale(baseDir, baseSpread));
    let middle: Vec3 = add([0, -below * 0.6, 0], scale(opts.cross ? norm(add(dir, baseDir)) : dir, reach * 0.55));
    if (h.onBand && !opts.peg) {
      // Straight up from the band beside the stone, within the band's width.
      const limit = Math.max(0, h.onBand.halfWidth - wire);
      const across = (p: Vec3): Vec3 => [p[0], p[1], clamp(p[2], -limit, limit)];
      base = across(add([0, -baseDepth, 0], scale(baseDir, reach * 0.9)));
      middle = across(add([0, -baseDepth * 0.45, 0], scale(dir, reach * 0.95)));
    }
    const control: Vec3[] = [
      base,
      middle,
      add([0, 0, 0], scale(dir, reach + wire * 0.6)),
      add([0, crown * 0.45, 0], scale(dir, reach * 0.93)),
    ];
    const path = smoothPath(control, 6).map((p) => toWorld(frame, p));
    tube(metal, path, wire, 10, false);
    sphere(metal, path[path.length - 1], wire * 1.1, 10);
  }
  if (opts.peg) tube(metal, [toWorld(frame, [0, -baseDepth - wire, 0]), toWorld(frame, [0, -below * 0.7, 0])], wire * 1.5, 12, false);
  return wire;
}

/** A gallery rail around the head at height `y` (fraction `scaleReach` of the girdle's reach). */
function rail(h: HeadInput, y: number, scaleReach: number, radius: number): void {
  const pts: Vec3[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const reach = outlineReach(h.outline, a) * scaleReach;
    pts.push(toWorld(h.frame, [Math.cos(a) * reach, y, Math.sin(a) * reach]));
  }
  tube(h.metal, pts, radius, 8, true);
}

/**
 * A bezel wall around the girdle, from `baseDepth` below to just over it. `keep` selects which
 * stretches of the outline get a wall (a half-bezel), each open stretch's ends closed flat.
 */
function bezelWall(h: HeadInput, keep: (angle: number) => boolean = () => true): void {
  const { metal, frame, outline, size, baseDepth } = h;
  const { crown } = cutProfile(h.shape, size);
  const wall = clamp(size * 0.12, 0.5, 1.0);
  const lip = crown * 0.35;
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
  const kept = outline.map(([x, z]) => keep(Math.atan2(z, x)));
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
      if (!kept[i] || !kept[j]) continue;
      const mid = scale(add(add(a[i], a[j]), add(b[i], b[j])), 0.25);
      const fromAxis = sub(mid, toWorld(frame, [0, dot(sub(mid, frame.origin), frame.y), 0]));
      const outward = add(scale(norm(fromAxis), nOff), scale(frame.y, nY));
      metal.flatPolygon([a[i], b[i], b[j], a[j]], outward);
    }
  }
  // Close the wall where a kept stretch ends.
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    if (kept[i] && !kept[j]) metal.flatPolygon(rings.map((ring) => ring[i]), dirToWorld(frame, [-outline[i][1], 0, outline[i][0]]));
    if (!kept[i] && kept[j]) metal.flatPolygon(rings.map((ring) => ring[j]), dirToWorld(frame, [outline[j][1], 0, -outline[j][0]]));
  }
}

function headBox(h: HeadInput, centre: Vec3, half: Vec3): void {
  box(h.metal, h.frame, centre, half);
}

/** Builds the head `code` around a stone (the stone itself is drawn by the caller). */
function buildHead(code: string, h: HeadInput): void {
  const { size, outline, baseDepth } = h;
  const { crown, pavilion } = cutProfile(h.shape, size);
  const below = Math.max(pavilion, size * 0.25);
  const reachX = outlineReach(outline, 0);
  const reachZ = outlineReach(outline, Math.PI / 2);
  const wall = clamp(size * 0.12, 0.5, 1.0);
  switch (code) {
    case 'BEZEL':
      bezelWall(h);
      return;
    case 'HALF_BEZEL':
      // Walls on the two sides along the band, open toward its edges.
      bezelWall(h, (a) => Math.abs(Math.cos(a)) > 0.42);
      return;
    case 'PEG_HEAD':
      prongSet(h, { peg: true });
      return;
    case 'TRELLIS': {
      const wire = prongSet(h, { cross: true });
      rail(h, -below * 0.45, 0.62, wire * 0.75);
      return;
    }
    case 'DECORATIVE': {
      const wire = prongSet(h);
      // A gallery of little arches between the prongs, each with a bead.
      for (let k = 0; k < h.prongs; k++) {
        const a0 = (k / h.prongs) * Math.PI * 2 + Math.PI / h.prongs;
        const a1 = a0 + (Math.PI * 2) / h.prongs;
        const pts: Vec3[] = [];
        for (let s = 0; s <= 10; s++) {
          const a = a0 + ((a1 - a0) * s) / 10;
          const reach = outlineReach(outline, a) * 0.72;
          const sag = Math.sin((Math.PI * s) / 10) * below * 0.35;
          pts.push(toWorld(h.frame, [Math.cos(a) * reach, -below * 0.2 - sag, Math.sin(a) * reach]));
        }
        tube(h.metal, pts, wire * 0.7, 8, false);
        sphere(h.metal, pts[5], wire * 1.1, 10);
      }
      return;
    }
    case 'BAR_CHANNEL': {
      // Two bars across the band, on the stone's two ends.
      [-1, 1].forEach((side) =>
        headBox(h, [side * (reachX + wall * 0.35), (-baseDepth + crown * 0.3) / 2, 0], [wall * 0.5, (baseDepth + crown * 0.3) / 2, reachZ * 0.75]),
      );
      return;
    }
    case 'CHANNEL': {
      // Two walls along the band's edges, the stone held between them.
      [-1, 1].forEach((side) =>
        headBox(h, [0, (-baseDepth + crown * 0.4) / 2, side * (reachZ + wall * 0.35)], [reachX * 1.15, (baseDepth + crown * 0.4) / 2, wall * 0.5]),
      );
      return;
    }
    case 'BRIGHT_CUT': {
      // The stone set in a square block, bright-cut beads at its corners.
      const half = Math.max(reachX, reachZ) + wall * 1.2;
      headBox(h, [0, (-baseDepth - h.size * 0.02) / 2, 0], [half, (baseDepth - h.size * 0.02) / 2, half]);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) =>
        sphere(h.metal, toWorld(h.frame, [sx * reachX * 0.75, crown * 0.05, sz * reachZ * 0.75]), Math.max(0.25, h.size * 0.05), 10),
      );
      return;
    }
    case 'ILLUSION': {
      // A wide plate around the stone (it looks bigger), with a beaded rim.
      const rim = offsetOutline(outline, wall * 2.4);
      const inner = offsetOutline(outline, -wall * 0.1);
      const top = -h.size * 0.02;
      const bottom = top - wall * 0.6;
      const ringPts = (o: P2[], y: number) => o.map(([x, z]) => toWorld(h.frame, [x, y, z]));
      const ot = ringPts(rim, top);
      const ob = ringPts(rim, bottom);
      const it = ringPts(inner, top);
      const ib = ringPts(inner, bottom);
      const n = outline.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        h.metal.flatPolygon([ot[i], ot[j], it[j], it[i]], h.frame.y);
        h.metal.flatPolygon([ob[i], ib[i], ib[j], ob[j]], scale(h.frame.y, -1));
        h.metal.flatPolygon([ot[i], ob[i], ob[j], ot[j]], dirToWorld(h.frame, [rim[i][0], 0, rim[i][1]]));
        h.metal.flatPolygon([it[i], it[j], ib[j], ib[i]], dirToWorld(h.frame, [-inner[i][0], 0, -inner[i][1]]));
        sphere(h.metal, scale(add(ot[i], ot[j]), 0.5), Math.max(0.2, wall * 0.35), 8);
      }
      tube(h.metal, [toWorld(h.frame, [0, -baseDepth, 0]), toWorld(h.frame, [0, bottom, 0])], Math.max(reachX, reachZ) * 0.45, 16, false);
      return;
    }
    case 'BRIDGE_ACCENT': {
      const wire = prongSet(h);
      rail(h, -below * 0.5, 0.6, wire * 0.8);
      // A small stone set in the bridge, facing the side of the ring.
      const accent = Math.max(1, h.size * 0.22);
      const f = frameFromUp(toWorld(h.frame, [0, -below * 0.55, reachZ * 0.62]), h.frame.z, h.frame.y);
      gem(h.accent, f, 'ROUND', accent);
      torus(h.metal, toWorld(f, [0, 0, 0]), f.x, f.z, accent / 2 + 0.14, 0.2, 20);
      return;
    }
    default: {
      // BASKET (and older 4- / 6-prong heads): prongs held by two gallery rails.
      const wire = prongSet(h);
      rail(h, -below * 0.5, 0.6, wire * 0.8);
      rail(h, -below * 0.15, 0.82, wire * 0.65);
    }
  }
}

/** Sets one stone in a head (`code`). */
function setStone(
  set: PartSet,
  metal: MeshBuilder,
  frame: Frame,
  stone: StoneSpec,
  size: number,
  code: string,
  prongs: number,
  baseDepth: number,
  baseSpread: number,
  onBand?: HeadInput['onBand'],
): void {
  const f = turnFrame(frame, stone.rotationDeg);
  gem(set.stone(stone.color, stone.opaque), f, stone.shape, size);
  setHead(set, metal, f, stone.shape, size, code, prongs, baseDepth, baseSpread, onBand);
}

/** A head (`code`) for a stone of `shape` and `size`, drawn without the stone (it is drawn apart, or not chosen yet). */
function setHead(
  set: PartSet,
  metal: MeshBuilder,
  frame: Frame,
  shape: CutCode,
  size: number,
  code: string,
  prongs: number,
  baseDepth: number,
  baseSpread: number,
  onBand?: HeadInput['onBand'],
): void {
  buildHead(code, {
    metal,
    frame,
    shape,
    outline: girdleOutline(shape, size),
    size,
    baseDepth,
    baseSpread,
    prongs,
    accent: set.stone('CRYSTAL', false),
    onBand,
  });
}

// ---------------------------------------------------------------------------------------------
// Decorative elements
// ---------------------------------------------------------------------------------------------

/** An older round plaque (an initial, an uploaded picture): a disc, an initial's with a raised rim. */
function roundPlaque(metal: MeshBuilder, frame: Frame, size: number, thickness: number, rim: boolean): void {
  const r = size / 2;
  const front: Vec3[] = [];
  const back: Vec3[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    front.push(toWorld(frame, [Math.cos(a) * r, Math.sin(a) * r, thickness / 2]));
    back.push(toWorld(frame, [Math.cos(a) * r, Math.sin(a) * r, -thickness / 2]));
  }
  metal.flatPolygon(front, frame.z);
  metal.flatPolygon(back.slice().reverse(), scale(frame.z, -1));
  for (let i = 0; i < 32; i++) {
    const j = (i + 1) % 32;
    metal.flatPolygon([front[i], back[i], back[j], front[j]], sub(scale(add(front[i], front[j]), 0.5), frame.origin));
  }
  if (rim) torus(metal, toWorld(frame, [0, 0, thickness / 2]), frame.x, frame.y, r - thickness * 0.6, thickness * 0.35, 40);
}

type Mapper = { point: (p: Vec3) => Vec3; normal: (n: Vec3, p: Vec3) => Vec3 };

/** Splits cap triangles with an edge longer than `maxEdge` (all triangles sharing it), so a cap can bend. */
function refine(points: P2[], tris: number[], maxEdge: number): { points: P2[]; tris: number[] } {
  if (!(maxEdge > 0)) return { points, tris };
  const pts = points.slice();
  let cur = tris.slice();
  for (let pass = 0; pass < 6; pass++) {
    const mids = new Map<string, number>();
    const long = (a: number, b: number) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]) > maxEdge;
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let m = mids.get(key);
      if (m == null) {
        m = pts.length;
        pts.push([(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2]);
        mids.set(key, m);
      }
      return m;
    };
    let changed = false;
    // Decide splits per edge first, so neighbours agree.
    const split = new Set<string>();
    for (let i = 0; i < cur.length; i += 3) {
      const [a, b, c] = [cur[i], cur[i + 1], cur[i + 2]];
      [[a, b], [b, c], [c, a]].forEach(([p, q]) => {
        if (long(p, q)) split.add(p < q ? `${p}_${q}` : `${q}_${p}`);
      });
    }
    if (!split.size) break;
    const isSplit = (p: number, q: number) => split.has(p < q ? `${p}_${q}` : `${q}_${p}`);
    const next: number[] = [];
    for (let i = 0; i < cur.length; i += 3) {
      const a = cur[i];
      const b = cur[i + 1];
      const c = cur[i + 2];
      const sab = isSplit(a, b);
      const sbc = isSplit(b, c);
      const sca = isSplit(c, a);
      const n = (sab ? 1 : 0) + (sbc ? 1 : 0) + (sca ? 1 : 0);
      if (n === 0) {
        next.push(a, b, c);
        continue;
      }
      changed = true;
      if (n === 3) {
        const ab = mid(a, b);
        const bc = mid(b, c);
        const ca = mid(c, a);
        next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      } else if (n === 1) {
        if (sab) { const m = mid(a, b); next.push(a, m, c, m, b, c); }
        else if (sbc) { const m = mid(b, c); next.push(a, b, m, a, m, c); }
        else { const m = mid(c, a); next.push(a, b, m, m, b, c); }
      } else {
        // Two split edges: rotate so the unsplit one is c-a.
        let [p, q, r] = [a, b, c];
        if (!sab) [p, q, r] = [c, a, b];
        else if (!sbc) [p, q, r] = [b, c, a];
        const pq = mid(p, q);
        const qr = mid(q, r);
        next.push(p, pq, r, pq, qr, r, pq, q, qr);
      }
    }
    cur = next;
    if (!changed) break;
  }
  return { points: pts, tris: cur };
}

/**
 * Extrudes an element's outlines (back at z = 0, face at its thickness), with its grooves sunk
 * into the face, through `map` (a flat frame, or bent onto a ring band).
 */
function extrudeMotif(metal: MeshBuilder, motif: MotifOutline, map: Mapper, maxEdge: number): void {
  const t = motif.thicknessMm;
  const gd = Math.min(motif.grooveDepthMm, t * 0.6);
  const prep = (loop: P2[]) => (maxEdge > 0 ? densifyLoop(loop, maxEdge * 0.95) : loop);
  const inside = (p: P2, poly: P2[]) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j];
      const [bx, by] = poly[i];
      if (ay > p[1] !== by > p[1] && p[0] < ((bx - ax) * (p[1] - ay)) / (by - ay) + ax) r = !r;
    }
    return r;
  };
  const cap = (outer: P2[], holes: P2[][], z: number, up: boolean) => {
    const flat = [outer, ...holes];
    const pts: P2[] = ([] as P2[]).concat(...flat);
    const raw = triangulate(outer, holes);
    const { points, tris } = refine(pts, raw, maxEdge);
    const n: Vec3 = [0, 0, up ? 1 : -1];
    const ids = points.map(([x, y]) => {
      const p: Vec3 = [x, y, z];
      return metal.vertex(map.point(p), map.normal(n, p));
    });
    for (let i = 0; i < tris.length; i += 3) metal.tri(ids[tris[i]], ids[tris[i + 1]], ids[tris[i + 2]]);
  };
  const walls = (loop: P2[], z0: number, z1: number, flip: boolean) => {
    const n = loop.length;
    const edgeN = loop.map((p, i) => {
      const q = loop[(i + 1) % n];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1;
      return flip ? ([-dy / l, dx / l] as P2) : ([dy / l, -dx / l] as P2);
    });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const e = edgeN[i];
      // Smooth across gentle bends, sharp at corners.
      const nAt = (k: number): P2 => {
        const prev = edgeN[(k - 1 + n) % n];
        const nextN = edgeN[k % n];
        const c = prev[0] * nextN[0] + prev[1] * nextN[1];
        if (c < 0.64) return e;
        const sx = prev[0] + nextN[0];
        const sy = prev[1] + nextN[1];
        const l = Math.hypot(sx, sy) || 1;
        return [sx / l, sy / l];
      };
      const ni = nAt(i);
      const nj = nAt(j);
      const v = (p: P2, z: number, nn: P2) => {
        const pp: Vec3 = [p[0], p[1], z];
        return metal.vertex(map.point(pp), map.normal([nn[0], nn[1], 0], pp));
      };
      metal.quad(v(loop[i], z0, ni), v(loop[j], z0, nj), v(loop[j], z1, nj), v(loop[i], z1, ni));
    }
  };
  motif.shape.shapes.forEach((s) => {
    const outer = prep(s.outer);
    const holes = s.holes.map(prep);
    const grooves = (motif.grooves?.shapes ?? []).filter((g) => inside(g.outer[0], s.outer) && !s.holes.some((h) => inside(g.outer[0], h)));
    const grooveOuters = grooves.map((g) => prep(g.outer));
    cap(outer, [...holes, ...grooveOuters], t, true);
    cap(outer, holes, 0, false);
    walls(outer, 0, t, false);
    holes.forEach((h) => walls(h, 0, t, false));
    grooves.forEach((g, k) => {
      const gHoles = g.holes.map(prep);
      cap(grooveOuters[k], gHoles, t - gd, true);
      walls(grooveOuters[k], t - gd, t, true);
      gHoles.forEach((h) => walls(h, t - gd, t, true));
    });
  });
}

/** The element's outlines at `size`, or null for a round plaque (an older initial, an uploaded picture). */
function elementOutline(element: ElementSpec, size: number): MotifOutline | null {
  const def = elementDef(element.code);
  if (!def || element.code === 'INITIAL') return null;
  return motifOutline(def, size, element.text, element.variant);
}

/** The default size of an element where it goes (`role`), within its catalogue range. */
function elementSize(element: ElementSpec, fallback: number): number {
  if (element.sizeMm != null) return element.sizeMm;
  const def = elementDef(element.code);
  return def ? clamp(fallback, def.minMm, def.maxMm) : fallback;
}

/** A flat element facing frame.z, centred on the frame origin (turned by its rotation). */
function flatElement(metal: MeshBuilder, frame: Frame, element: ElementSpec, size: number): { top: Vec3; left: Vec3; right: Vec3 } {
  const outline = elementOutline(element, size);
  const rot = element.rotationDeg * DEG;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  if (!outline) {
    roundPlaque(metal, frame, size, 1.0, element.code === 'INITIAL');
    return { top: toWorld(frame, [0, size / 2, 0]), left: toWorld(frame, [-size / 2, 0, 0]), right: toWorld(frame, [size / 2, 0, 0]) };
  }
  const t = outline.thicknessMm;
  const local = (p: Vec3): Vec3 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2] - t / 2];
  extrudeMotif(metal, outline, {
    point: (p) => toWorld(frame, local(p)),
    normal: (n) => dirToWorld(frame, [n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]]),
  }, 0);
  // Where it hangs from: the top of its outline near the middle (a bail), and its two ends.
  let top: P2 = [0, outline.shape.max[1]];
  let topY = -Infinity;
  let left: P2 = [outline.shape.min[0], 0];
  let right: P2 = [outline.shape.max[0], 0];
  const turned = (p: P2): P2 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  outline.shape.shapes.forEach((sh) =>
    sh.outer.forEach((p) => {
      const q = turned(p);
      if (Math.abs(q[0]) <= size * 0.14 && q[1] > topY) {
        topY = q[1];
        top = q;
      }
      if (q[0] < left[0]) left = q;
      if (q[0] > right[0]) right = q;
    }),
  );
  if (!Number.isFinite(topY)) top = turned([0, outline.shape.max[1]]);
  return { top: toWorld(frame, [top[0], top[1], 0]), left: toWorld(frame, [left[0], left[1], 0]), right: toWorld(frame, [right[0], right[1], 0]) };
}

/** An element bent onto a ring band of outer radius `ro`, its back on the band. */
function bandElement(metal: MeshBuilder, element: ElementSpec, size: number, ro: number, angle: number, offset: number): void {
  const outline = elementOutline(element, size);
  const rot = element.rotationDeg * DEG;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  if (!outline) {
    const radial: Vec3 = [Math.cos(angle), Math.sin(angle), 0];
    const tangent = norm(cross([0, 0, 1], radial));
    roundPlaque(metal, { origin: add(scale(radial, ro + 0.45), [0, 0, offset]), x: tangent, y: [0, 0, 1], z: radial }, size, 0.9, element.code === 'INITIAL');
    return;
  }
  const map: Mapper = {
    point: ([x, y, z]) => {
      const u = x * c - y * s;
      const v = x * s + y * c;
      const a = angle - u / ro;
      const r = ro + z - 0.02;
      return [Math.cos(a) * r, Math.sin(a) * r, offset + v];
    },
    normal: ([nx, ny, nz], [x, y]) => {
      const u = x * c - y * s;
      const a = angle - u / ro;
      const nu = nx * c - ny * s;
      const nv = nx * s + ny * c;
      const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
      const tangent: Vec3 = [Math.sin(a), -Math.cos(a), 0];
      return add(add(scale(tangent, nu), scale([0, 0, 1], nv)), scale(radial, nz));
    },
  };
  extrudeMotif(metal, outline, map, 0.8);
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

class PartSet {
  metal = new MeshBuilder();
  private stones = new Map<string, { mesh: MeshBuilder; color: string; opaque: boolean }>();

  /** The mesh of the stones of one colour (opaque stones apart). */
  stone(color: string, opaque: boolean): MeshBuilder {
    const key = `${color}${opaque ? ':opaque' : ''}`;
    let entry = this.stones.get(key);
    if (!entry) {
      entry = { mesh: new MeshBuilder(), color, opaque };
      this.stones.set(key, entry);
    }
    return entry.mesh;
  }

  parts(metalCode: string): JewelryPart[] {
    const out: JewelryPart[] = [{ material: 'metal', code: metalCode, mesh: this.metal.data() }];
    this.stones.forEach((entry) => {
      if (entry.mesh.indices.length) out.push({ material: 'stone', code: entry.color, ...(entry.opaque ? { opaque: true } : {}), mesh: entry.mesh.data() });
    });
    return out;
  }
}

/** Keeps a decoration placed on a ring band off the head (at `headAngle`). */
function awayFromHead(angle: number, headAngle: number | null, clearance: number): number {
  if (headAngle == null) return angle;
  let d = Math.atan2(Math.sin(angle - headAngle), Math.cos(angle - headAngle));
  if (Math.abs(d) < clearance) d = d >= 0 ? clearance : -clearance;
  return headAngle + d;
}

/** An arc of the ring band an item takes (radians either side of `angle`). */
interface BandArc {
  angle: number;
  half: number;
}

/**
 * Stones in a row along the band, each `step` radians apart, centred on `centre`. A seat on an arc
 * the centre stone's head or an item the user put on the band takes is left out, and the row goes
 * on further along both sides instead (pavé on both shoulders of the centre stone).
 */
function bandAngles(count: number, step: number, centre: number, taken: BandArc[] = []): number[] {
  const free = (a: number) =>
    taken.every((arc) => Math.abs(Math.atan2(Math.sin(a - arc.angle), Math.cos(a - arc.angle))) >= arc.half + step / 2);
  const row = Array.from({ length: count }, (_, i) => centre + (i - (count - 1) / 2) * step);
  if (row.every(free)) return row;
  // Every seat of the row's spacing around the whole band, nearest the row's centre first.
  const first = row[0];
  const around = Math.floor((Math.PI * 2) / step);
  const seats: number[] = [];
  for (let i = -around; i <= around + count; i++) {
    const a = first + i * step;
    if (Math.abs(a - centre) <= Math.PI - step / 2) seats.push(a);
  }
  seats.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);
  return seats
    .filter(free)
    .slice(0, count)
    .sort((a, b) => a - b);
}

/** Half the length along the band (mm) of an element turned by its rotation. */
function elementHalfAlongBand(element: ElementSpec, size: number): number {
  const outline = elementOutline(element, size);
  const w = outline ? outline.shape.max[0] - outline.shape.min[0] : size;
  const h = outline ? outline.shape.max[1] - outline.shape.min[1] : size;
  const r = element.rotationDeg * DEG;
  return (Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))) / 2;
}

/** A band setting: a row (or rows) of stones along the ring band, held in the style's metal. */
function buildBand(spec: JewelrySpec, set: PartSet, band: BandSpec, ro: number, taken: BandArc[] = [], zShift = 0): { from: number; to: number } {
  const w = spec.ring.bandWidthMm;
  const d = band.stoneMm;
  const wall = bandWallMm(d);
  const metal = set.metal;
  const mesh = set.stone(band.color, band.opaque);
  const raised = ['BAND_SURFACE_PRONG', 'BAND_SHARED_PRONG', 'BAND_SCALLOP', 'BAND_FISHTAIL', 'BAND_BEZEL'].includes(band.code);
  const gap = band.code === 'BAND_GYPSY_FLUSH' ? d * 1.2 : band.code === 'BAND_BEZEL' ? wall * 2 + 0.1 : raised ? 0.35 : 0.2;
  const step = (d + gap) / ro;
  const most = Math.max(1, Math.floor((Math.PI * 2) / step));
  const count = Math.min(band.count, most);
  const angles = bandAngles(count, step, band.angle, taken);
  const rowZ = Array.from({ length: band.rows }, (_, i) => (i - (band.rows - 1) / 2) * (d + wall));
  const rowsWidth = band.rows * d + (band.rows - 1) * wall;
  const crown = d * 0.16;
  // Flush styles: the table level with the band; raised styles: the girdle over it.
  const girdleR = raised ? ro + d * 0.3 : ro - crown * 0.75;
  const bead = Math.max(0.16, Math.min(0.24, d * 0.15));
  // `zShift`: the middle of the band this row runs on (one of a double / triple shank's).
  const at = (a: number, r: number, z: number): Vec3 => [Math.cos(a) * r, Math.sin(a) * r, z + zShift];
  const prong = (a: number, z: number, toR: number, toZ: number) => {
    const path = smoothPath([at(a, ro - 0.1, z), at(a, (ro + toR) / 2, (z + toZ) / 2), at(a, toR + crown * 0.4, toZ)], 4);
    tube(metal, path, Math.max(0.18, d * 0.1), 8, false);
    sphere(metal, path[path.length - 1], Math.max(0.2, d * 0.12), 8);
  };
  const arcSpan = (count - 1) * step + d / ro;
  const from = band.angle - arcSpan / 2;
  const to = band.angle + arcSpan / 2;

  angles.forEach((a) =>
    rowZ.forEach((z) => {
      const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
      gem(mesh, frameFromUp(at(a, girdleR, z), radial, [0, 0, 1]), 'ROUND', d);
    }),
  );

  switch (band.code) {
    case 'BAND_CHANNEL': {
      // Two walls along the band's edges, over the girdles.
      const z = rowsWidth / 2 + wall / 2;
      [-1, 1].forEach((side) =>
        revolve(metal, roundedRect(ro - 0.2, ro + crown * 0.5, side * z - wall / 2, side * z + wall / 2, wall * 0.3, 2), 48, 'Z', [0, 0, zShift], true, undefined, from - step / 2, to + step / 2),
      );
      break;
    }
    case 'BAND_BAR': {
      // Bars across the band between the stones.
      const bars = [band.angle - (count / 2) * step, ...angles.map((a) => a + step / 2)];
      bars.forEach((a) => {
        const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
        const f = frameFromUp(at(a, ro, 0), radial, [0, 0, 1]);
        box(metal, f, [0, crown * 0.4, 0], [Math.max(0.18, d * 0.12), crown * 0.4 + 0.2, rowsWidth / 2 + wall * 0.4]);
      });
      break;
    }
    case 'BAND_BEZEL':
      angles.forEach((a) =>
        rowZ.forEach((z) => {
          const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
          const f = frameFromUp(at(a, girdleR, z), radial, [0, 0, 1]);
          bezelWall({ metal, frame: f, shape: 'ROUND', outline: girdleOutline('ROUND', d), size: d, baseDepth: girdleR - ro + 0.3, baseSpread: 0, prongs: 4, accent: mesh });
        }),
      );
      break;
    case 'BAND_SURFACE_PRONG':
      angles.forEach((a) =>
        rowZ.forEach((z) => {
          [-1, 1].forEach((side) =>
            [-1, 1].forEach((zs) => {
              const pa = a + side * (d * 0.36) / ro;
              prong(pa, z + zs * d * 0.36, girdleR, z + zs * d * 0.36);
            }),
          );
        }),
      );
      break;
    case 'BAND_SHARED_PRONG':
    case 'BAND_SCALLOP': {
      const gaps = [angles[0] - step / 2, ...angles.map((a) => a + step / 2)];
      gaps.forEach((a) => [-1, 1].forEach((zs) => prong(a, zs * (rowsWidth / 2 - d * 0.1), girdleR, zs * (rowsWidth / 2 - d * 0.15))));
      if (band.code === 'BAND_SCALLOP') {
        // Scalloped edges: an arch under each stone on both sides of the band.
        angles.forEach((a) =>
          [-1, 1].forEach((zs) => {
            const pts: Vec3[] = [];
            for (let k = 0; k <= 8; k++) {
              const t = (k / 8) * Math.PI;
              const aa = a + Math.cos(t) * (d * 0.5) / ro;
              pts.push(at(aa, ro - 0.15 - Math.sin(t) * d * 0.25, zs * (w / 2 + 0.05)));
            }
            tube(metal, pts, Math.max(0.15, d * 0.08), 8, false);
          }),
        );
      }
      break;
    }
    case 'BAND_FISHTAIL': {
      // Flat split prongs between the stones, opening in a V like a fish's tail.
      const gaps = [angles[0] - step / 2, ...angles.map((a) => a + step / 2)];
      gaps.forEach((a) =>
        [-1, 1].forEach((zs) =>
          [-1, 1].forEach((side) => {
            const base = at(a, ro - 0.05, zs * rowsWidth * 0.3);
            const tip = at(a + side * (d * 0.3) / ro, girdleR + crown * 0.3, zs * rowsWidth * 0.42);
            tube(metal, [base, tip], Math.max(0.15, d * 0.08), 6, false);
          }),
        ),
      );
      break;
    }
    case 'BAND_FRENCH_V_SPLIT': {
      // Each gap: two prongs splitting in a V to the neighbouring stones, both sides.
      const gaps = [angles[0] - step / 2, ...angles.map((a) => a + step / 2)];
      gaps.forEach((a) =>
        [-1, 1].forEach((zs) => {
          const base = at(a, ro - 0.05, zs * (rowsWidth / 2 + wall * 0.2));
          [-1, 1].forEach((side) => {
            const tip = at(a + side * (d * 0.28) / ro, girdleR + crown * 0.5, zs * (rowsWidth / 2 - d * 0.12));
            tube(metal, [base, tip], Math.max(0.14, d * 0.07), 6, false);
            sphere(metal, tip, Math.max(0.16, d * 0.09), 8);
          });
        }),
      );
      break;
    }
    case 'BAND_GYPSY_FLUSH':
      // Each stone sunk in the band, a bright rim around it.
      angles.forEach((a) =>
        rowZ.forEach((z) => {
          const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
          torus(metal, add(scale(radial, ro + 0.02), [0, 0, z + zShift]), [0, 0, 1], norm(cross(radial, [0, 0, 1])), d / 2 + 0.14, Math.max(0.14, d * 0.09), 20);
        }),
      );
      break;
    default: {
      // PAVE and BAND_BEAD_BRIGHT_CUT: beads between the stones, bright-cut rails on the edges.
      angles.forEach((a, i) => {
        if (i === angles.length - 1) return;
        const b = a + step / 2;
        rowZ.forEach((z) => [-1, 1].forEach((zs) => sphere(metal, at(b, ro + bead * 0.3, z + zs * d * 0.38), bead, 8)));
      });
      if (band.code === 'BAND_BEAD_BRIGHT_CUT' || band.rows > 1) {
        const z = rowsWidth / 2 + wall * 0.5;
        [-1, 1].forEach((side) =>
          revolve(metal, roundedRect(ro - 0.1, ro + 0.08, side * z - wall * 0.35, side * z + wall * 0.35, 0.05, 1), 48, 'Z', [0, 0, zShift], true, undefined, from - step / 2, to + step / 2),
        );
      }
    }
  }
  return { from, to };
}

/** Where the items of a ring go (the head, the stones on the band, the elements), before drawing. */
export interface RingLayout {
  outerRadiusMm: number;
  /** The head's place on the band (radians), or null: no head. */
  headAngle: number | null;
  /** Half the head's length along the band (its girdle), mm. */
  headHalfMm: number;
  accents: Array<{ stone: StoneSpec; size: number; angle: number }>;
  elements: Array<{ element: ElementSpec; size: number; halfMm: number; angle: number }>;
}

/**
 * The ring's layout. A stone on the band keeps 1 mm off the head; an element lies right against
 * the head's girdle, on the side it was put (the client's notes of 23.11: an element moved to the
 * head jumped to its other side).
 */
export function ringLayout(spec: JewelrySpec): RingLayout {
  const ri = spec.ring.innerDiameterMm / 2;
  const w = spec.ring.bandWidthMm;
  const t = spec.ring.bandThicknessMm;
  const ro = ri + t;
  const head = spec.setting;
  const [main, ...rest] = spec.stones;
  const centre = head && main ? main : null;
  const accents = centre ? rest : spec.stones;
  // A head stands on the band whether or not its stone is chosen yet.
  const headAngle = head ? headAngleOf(spec) : null;
  const centreSize = stoneSize(centre ?? undefined, CENTER_STONE_MM);
  const shape: CutCode = centre?.shape ?? 'ROUND';
  // Along the band is the stone's own x turned by its rotation; the longer of its two ends (a pear's
  // point and its round end differ).
  const outline = girdleOutline(shape, centreSize);
  const turn = -(centre?.rotationDeg ?? 0) * DEG;
  const headHalfMm = headAngle == null ? 0 : Math.max(outlineReach(outline, turn), outlineReach(outline, turn + Math.PI));
  const stoneClearance = headAngle == null ? 0 : (centreSize / 2 + 1) / ro;
  return {
    outerRadiusMm: ro,
    headAngle,
    headHalfMm,
    accents: accents.map((stone) => {
      const size = stoneSize(stone, clamp(Math.min(w * 0.7, t * 1.3), 1.0, 2.6));
      return { stone, size, angle: awayFromHead(stone.angle, headAngle, stoneClearance + size / 2 / ro) };
    }),
    elements: spec.elements.map((element) => {
      const size = elementSize(element, clamp(w * 1.4, 3.5, 8));
      const halfMm = elementHalfAlongBand(element, size);
      return { element, size, halfMm, angle: awayFromHead(element.angle, headAngle, (headHalfMm + halfMm) / ro) };
    }),
  };
}

/**
 * Where an item dragged on the model goes. An element dragged over the head stays against the
 * head on the side it came from (`fromAngleDeg`, where it was before), instead of jumping to the
 * other side when the finger passes the head's middle.
 */
export function dragPlacement(
  spec: JewelrySpec,
  target: { kind: 'stone' | 'element'; index: number },
  point: Vec3,
  fromAngleDeg: number | null,
): { angleDeg: number; offsetMm: number } {
  const placed = placementFromPoint(spec, point);
  if (spec.itemType !== 'RING' || target.kind !== 'element') return placed;
  const layout = ringLayout(spec);
  const seat = layout.elements[target.index];
  if (layout.headAngle == null || !seat) return placed;
  const zone = (layout.headHalfMm + seat.halfMm) / layout.outerRadiusMm;
  const off = (deg: number) => Math.atan2(Math.sin(deg * DEG - layout.headAngle!), Math.cos(deg * DEG - layout.headAngle!));
  const d = off(placed.angleDeg);
  if (Math.abs(d) >= zone) return placed;
  const side = (fromAngleDeg != null ? off(fromAngleDeg) : d) >= 0 ? 1 : -1;
  let angleDeg = (layout.headAngle + side * zone) / DEG;
  angleDeg = ((angleDeg % 360) + 360) % 360;
  return { angleDeg: Math.round(angleDeg * 10) / 10, offsetMm: placed.offsetMm };
}

/** A ring band swept around the finger with a section that changes with the angle (a split shank's arm). */
function sweepBand(mesh: MeshBuilder, segments: number, sectionAt: (angle: number) => P2[]): void {
  const rows: number[][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const section = sectionAt(a);
    const centre: P2 = [
      section.reduce((sum, p) => sum + p[0], 0) / section.length,
      section.reduce((sum, p) => sum + p[1], 0) / section.length,
    ];
    const normals = profileNormals(section, true, centre);
    rows.push(section.map((p, j) => mesh.vertex([p[0] * c, p[0] * s, p[1]], [normals[j][0] * c, normals[j][0] * s, normals[j][1]])));
  }
  const count = rows[0].length;
  for (let i = 0; i < segments; i++) {
    const a = rows[i];
    const b = rows[(i + 1) % segments];
    for (let j = 0; j < count; j++) {
      const j2 = (j + 1) % count;
      mesh.quad(a[j], b[j], b[j2], a[j2]);
    }
  }
}

/** The ring's shank: one band, two / three side by side, or a band that splits into two arms. */
function buildShank(spec: JewelrySpec, set: PartSet, ri: number, ro: number): void {
  const w = spec.ring.bandWidthMm;
  const t = spec.ring.bandThicknessMm;
  if (spec.ring.shankStyle === 'SPLIT') {
    const s = splitShank(spec);
    const top = headAngleOf(spec);
    const corner = Math.min(t, s.armWidth) * 0.4;
    [-1, 1].forEach((side) =>
      sweepBand(set.metal, 160, (a) => {
        const c = side * (s.base + s.spread * splitAmount(a, top, s.spanRad));
        return roundedRect(ri, ro, c - s.armWidth / 2, c + s.armWidth / 2, corner, 4);
      }),
    );
    return;
  }
  shankCentresMm(spec).forEach((c) =>
    revolve(set.metal, roundedRect(ri, ro, c - w / 2, c + w / 2, Math.min(t, w) * 0.4, 5), 160, 'Z', [0, 0, 0], true, [ri + t / 2, c]),
  );
}

/**
 * The bands of a double / triple shank, and a split shank's arms, are joined under the head by a
 * plate across them (a double / triple shank is joined on its top even without a head).
 */
function buildShankBridge(spec: JewelrySpec, set: PartSet, ri: number, ro: number, angle: number, headHalfMm: number): void {
  const w = spec.ring.bandWidthMm;
  const t = spec.ring.bandThicknessMm;
  const half = ringHalfWidthMm(spec);
  const along = (Math.max(headHalfMm * 0.9, w / 2) + 0.4) / ro;
  revolve(set.metal, roundedRect(ri + t * 0.15, ro, -half, half, Math.min(t, w) * 0.3, 3), 24, 'Z', [0, 0, 0], true, undefined, angle - along, angle + along);
}

function buildRing(spec: JewelrySpec, set: PartSet): void {
  const ri = spec.ring.innerDiameterMm / 2;
  const w = spec.ring.bandWidthMm;
  const t = spec.ring.bandThicknessMm;
  const ro = ri + t;
  const shank = spec.ring.shankStyle;
  buildShank(spec, set, ri, ro);

  const head = spec.setting;
  const centre = head && spec.stones[0] ? spec.stones[0] : null;
  const layout = ringLayout(spec);
  const { headAngle, headHalfMm } = layout;
  const centreSize = stoneSize(centre ?? undefined, CENTER_STONE_MM);
  if (shank === 'DOUBLE' || shank === 'TRIPLE' || (shank === 'SPLIT' && headAngle != null)) {
    buildShankBridge(spec, set, ri, ro, headAngle ?? RING_TOP_DEG * DEG, headAngle != null ? headHalfMm : 0);
  }

  // A band setting's stones keep clear of the head and of what the user put on the band; on a
  // double / triple shank a row runs on every band.
  if (spec.band) {
    const taken: BandArc[] = [
      ...(headAngle != null ? [{ angle: headAngle, half: (centreSize / 2 + 0.6) / ro }] : []),
      ...layout.accents.map((seat) => ({ angle: seat.angle, half: (seat.size / 2 + 0.4) / ro })),
      ...layout.elements.map((seat) => ({ angle: seat.angle, half: (seat.halfMm + 0.3) / ro })),
    ];
    shankCentresMm(spec).forEach((c) => buildBand(spec, set, spec.band!, ro, taken, c));
  }

  if (head && headAngle != null) {
    // The head sits on the band (the client's notes of 23.11: "at height 0, the prongs straight out
    // of the ring"): the pavilion in a seat in the band, never through to the finger.
    const shape: CutCode = centre?.shape ?? 'ROUND';
    const size = centreSize;
    const { girdle, pavilion } = cutProfile(shape, size);
    const seat = pavilion > 0 ? Math.max(pavilion * 0.45, ri + 0.3 + pavilion + girdle / 2 - ro) : girdle / 2 + 0.05;
    const radial: Vec3 = [Math.cos(headAngle), Math.sin(headAngle), 0];
    const frame = frameFromUp(scale(radial, ro + seat), radial, [0, 0, 1]);
    const onBand = { halfWidth: ringHalfWidthMm(spec) };
    const baseDepth = seat + 0.25;
    const baseSpread = Math.min(w * 0.38, size * 0.3);
    if (centre) setStone(set, set.metal, frame, centre, size, head, spec.prongs, baseDepth, baseSpread, onBand);
    // Chosen before its stone: the head alone, shown where the stone will sit.
    else setHead(set, set.metal, frame, shape, size, head, spec.prongs, baseDepth, baseSpread, onBand);
  }

  layout.accents.forEach(({ stone, size, angle: a }) => {
    const radial: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const z = shank === 'SINGLE' ? clamp(stone.offsetMm, -Math.max(0, w / 2 - size / 2 - 0.2), Math.max(0, w / 2 - size / 2 - 0.2)) : onShank(spec, a, stone.offsetMm, size / 2 + 0.2);
    const origin = add(scale(radial, ro - size * 0.1), [0, 0, z]);
    const frame = turnFrame(frameFromUp(origin, radial, [0, 0, 1]), stone.rotationDeg);
    gem(set.stone(stone.color, stone.opaque), frame, stone.shape, size);
    // A thin bezel rim holds the flush-set stone.
    torus(set.metal, add(scale(radial, ro + 0.02), [0, 0, z]), [0, 0, 1], norm(cross(radial, [0, 0, 1])), size / 2 + 0.16, 0.22, 24);
  });

  layout.elements.forEach(({ element, size, angle: a }) => {
    const z = shank === 'SINGLE' ? clamp(element.offsetMm, -w / 2, w / 2) : onShank(spec, a, element.offsetMm, 0);
    bandElement(set.metal, element, size, ro, a, z);
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

/** A stone in a head (a bezel unless another is chosen) facing the viewer (+Z), centred on `centre`. */
function stoneStation(set: PartSet, stone: StoneSpec, centre: Vec3, size: number, head: string | null, prongs: number): void {
  const frame = frameFromUp(centre, [0, 0, 1], [0, 1, 0]);
  setStone(set, set.metal, frame, stone, size, head ?? 'BEZEL', prongs, size * 0.3, size * 0.25);
}

/** A charm hanging from `anchor` in direction `down` (unit, in the XY plane), facing +Z. */
function charm(set: PartSet, element: ElementSpec, anchor: Vec3, down: Vec3, size: number): void {
  const ring = 1.3;
  torus(set.metal, add(anchor, scale(down, ring)), down, [0, 0, 1], ring, 0.35, 20);
  const side = norm(cross([0, 0, 1], down));
  const up = scale(down, -1);
  if (element.code === 'INFINITY') {
    // "Anchor points at both ends", for the chain's loops: it rides along the chain.
    const frame: Frame = { origin: add(anchor, scale(down, ring * 2 + size * 0.2)), x: side, y: up, z: [0, 0, 1] };
    const ends = flatElement(set.metal, frame, element, size);
    [ends.left, ends.right].forEach((p) => torus(set.metal, add(p, scale(down, -0.6)), down, [0, 0, 1], 0.9, 0.3, 16));
    return;
  }
  // Built first at the anchor, then moved so its bail (the top near the middle) meets the jump ring.
  const probe = new MeshBuilder();
  const at: Frame = { origin: [0, 0, 0], x: side, y: up, z: [0, 0, 1] };
  const { top } = flatElement(probe, at, element, size);
  const origin = sub(add(anchor, scale(down, ring * 2 - 0.25)), top);
  flatElement(set.metal, { ...at, origin }, element, size);
}

function chainPiece(spec: JewelrySpec, set: PartSet, curve: (u: number) => Vec3, lengthMm: number, bottom: Vec3, top: Vec3, centre: Vec3): void {
  cableChain(set.metal, curve, lengthMm);
  // Spring-ring clasp at the top.
  torus(set.metal, add(top, [0, 2.2, 0]), [1, 0, 0], [0, 1, 0], 2.2, 0.7, 28);

  const pointAt = (angle: number) => {
    // Angles map onto the curve the way the studio places items around the piece.
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
  const [main, ...others] = spec.stones;
  let elements = spec.elements;
  if (main) {
    const size = stoneSize(main, spec.itemType === 'NECKLACE' ? 6 : 5);
    const p = main.placed ? pointAt(main.angle) : bottom;
    const down = norm(sub(p, centre));
    torus(set.metal, add(p, scale(down, 1.6)), down, [0, 0, 1], 1.6, 0.5, 20);
    stoneStation(set, main, add(p, scale(down, 3.2 + size / 2 + 0.6)), size, spec.setting, spec.prongs);
  } else if (elements.length) {
    const first = elements[0];
    const p = first.placed ? pointAt(first.angle) : bottom;
    charm(set, first, p, norm(sub(p, centre)), elementSize(first, spec.itemType === 'NECKLACE' ? 11 : 8));
    elements = elements.slice(1);
  }
  others.forEach((stone) => {
    const p = pointAt(stone.angle);
    stoneStation(set, { ...stone }, add(p, [0, 0, 1.2]), stoneSize(stone, 3), 'BEZEL', 4);
  });
  elements.forEach((element) => {
    const p = pointAt(element.angle);
    charm(set, element, p, norm(sub(p, centre)), elementSize(element, spec.itemType === 'NECKLACE' ? 8 : 6.5));
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
  const [main, second, ...extraStones] = spec.stones;
  const [element, ...extraElements] = spec.elements;
  const base: Vec3 = [offsetX, 0, 0];
  // Further stones and elements go around the centre where the user put them.
  const orbit = (angle: number, offset: number, fallback: number): Vec3 => {
    const r = offset > 0 ? offset : fallback;
    return add(base, [Math.cos(angle) * r, Math.sin(angle) * r, 0.4]);
  };
  const decorate = (reach: number) => {
    extraStones.forEach((stone) => {
      const size = stoneSize(stone, 2);
      stoneStation(set, stone, orbit(stone.angle, stone.offsetMm, reach + size / 2 + 0.6), size, 'BEZEL', 4);
    });
    extraElements.forEach((el) => {
      const size = elementSize(el, 5);
      flatElement(set.metal, { origin: orbit(el.angle, el.offsetMm, reach + size / 2 + 0.6), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, el, size);
    });
  };
  if (spec.earrings.style === 'stud') {
    // Post behind the face, then a stone in its head, a shaped element, or a polished dome.
    tube(set.metal, [add(base, [0, 0, -0.5]), add(base, [0, 0, -11])], 0.45, 10, false);
    if (main) {
      const size = stoneSize(main, 5);
      const { pavilion } = cutProfile(main.shape, size);
      const lift = Math.max(pavilion, size * 0.2) + 0.8;
      const frame = frameFromUp(add(base, [0, 0, lift]), [0, 0, 1], [0, 1, 0]);
      setStone(set, set.metal, frame, main, size, spec.setting ?? 'BASKET', spec.prongs, lift + 0.4, size * 0.3);
      let reach = size / 2;
      // The second stone rings the centre stone, until the user moves it somewhere else.
      if (second && second.placed) extraStones.unshift(second);
      else if (second) {
        // A halo of the second stone around the centre stone.
        const melee = clamp(second.sizeMm ?? size * 0.22, 0.9, 1.6);
        reach = size / 2 + melee / 2 + 0.35;
        const count = Math.max(8, Math.floor((2 * Math.PI * reach) / (melee + 0.25)));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const origin = add(base, [Math.cos(a) * reach, Math.sin(a) * reach, 0.6]);
          gem(set.stone(second.color, second.opaque), frameFromUp(origin, [0, 0, 1], [0, 1, 0]), 'ROUND', melee);
        }
        torus(set.metal, add(base, [0, 0, 0.3]), [1, 0, 0], [0, 1, 0], reach, melee * 0.5, 48);
        reach += melee / 2;
      }
      if (element) extraElements.unshift(element);
      decorate(reach);
    } else if (element) {
      const size = elementSize(element, 8);
      flatElement(set.metal, { origin: add(base, [0, 0, 0.5]), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, element, size);
      decorate(size / 2);
    } else {
      // A polished metal ball.
      sphere(set.metal, add(base, [0, 0, 0.4]), 3, 24);
      decorate(3);
    }
    return;
  }

  // Drop: ear wire, jump ring, then the stone and / or element hanging below.
  const hook: Vec3[] = smoothPath(
    [add(base, [0, 2.5, 0]), add(base, [0, 9, 1]), add(base, [0, 14, -3]), add(base, [0, 11, -9]), add(base, [0, 4, -11])],
    8,
  );
  tube(set.metal, hook, 0.42, 8, false);
  torus(set.metal, add(base, [0, 1.3, 0]), [0, 1, 0], [0, 0, 1], 1.3, 0.4, 20);
  let y = 0;
  if (main) {
    const size = stoneSize(main, 6);
    stoneStation(set, main, add(base, [0, -(size / 2 + 1.4), 0]), size, spec.setting, spec.prongs);
    y = -(size + 2.2);
  }
  if (element) {
    if (main) torus(set.metal, add(base, [0, y - 1.1, 0]), [0, 1, 0], [0, 0, 1], 1.1, 0.35, 20);
    const anchor = main ? y - 2.2 : 0;
    charm(set, element, add(base, [0, anchor, 0]), [0, -1, 0], elementSize(element, 9));
  } else if (!main) {
    // A polished metal teardrop.
    const tear: P2[] = [];
    for (let i = 0; i <= 20; i++) {
      const tt = (i / 20) * Math.PI;
      tear.push([Math.sin(tt) * 3.4 * Math.pow(Math.sin(tt / 2), 0.6), Math.cos(tt) * 5.5]);
    }
    revolve(set.metal, tear, 32, 'Y', add(base, [0, -7, 0]), false, [0, 0]);
  }
  if (second) extraStones.unshift(second);
  decorate(main ? stoneSize(main, 6) / 2 : 3);
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

