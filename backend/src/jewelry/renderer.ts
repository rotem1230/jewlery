import { JewelryModel, METAL_REFLECTANCE, STONE_COLORS, modelBounds, turnedModel, viewTurn } from './geometry';
import { RgbaImage } from './png';

/**
 * Software renderer for jewelry pictures: perspective z-buffer rasterisation of the model's
 * triangles, per-pixel shading against a procedural photo-studio environment (metals reflect it,
 * stones sparkle on their facets), filmic tone mapping and supersampled anti-aliasing. No GPU,
 * no native modules — it runs wherever the API runs.
 */

export interface RenderView {
  /** Degrees around the vertical axis (0 = straight on). */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
  fov: number;
  /** Fraction of the picture the piece's bounding sphere fills. */
  fill: number;
}

export interface RenderOptions {
  size: number;
  /** Samples per pixel along each axis (2 → 4 samples per pixel). */
  supersample?: number;
  /** 'studio' paints a soft backdrop and contact shadow; 'transparent' keeps alpha. */
  background?: 'studio' | 'transparent';
  view?: Partial<RenderView>;
  /** Image stamped in the lower corner (free-plan exports). */
  watermark?: RgbaImage | null;
}

const VIEWS: Record<string, RenderView> = {
  RING: { azimuth: 28, elevation: 20, fov: 30, fill: 0.78 },
  NECKLACE: { azimuth: 0, elevation: 12, fov: 30, fill: 0.86 },
  BRACELET: { azimuth: 0, elevation: 18, fov: 30, fill: 0.84 },
  EARRINGS: { azimuth: 16, elevation: 10, fov: 30, fill: 0.84 },
};

type V3 = [number, number, number];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hexToLinear(hex: string): V3 {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

/** ACES filmic curve (Narkowicz fit). */
function aces(x: number): number {
  const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Tone maps by luminance so bright gold stays gold instead of bleaching to white; only the part
 * of a channel above white is pushed toward white (highlights).
 */
function toneMap(r: number, g: number, b: number, out: Float64Array): void {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (l <= 1e-9) {
    out[0] = out[1] = out[2] = 0;
    return;
  }
  const k = aces(l) / l;
  let tr = r * k;
  let tg = g * k;
  let tb = b * k;
  const over = Math.max(tr, tg, tb) - 1;
  if (over > 0) {
    const w = Math.min(1, over);
    tr = Math.min(1, tr) * (1 - w) + w;
    tg = Math.min(1, tg) * (1 - w) + w;
    tb = Math.min(1, tb) * (1 - w) + w;
  }
  out[0] = tr;
  out[1] = tg;
  out[2] = tb;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Procedural photo studio: soft top box, two strip lights, a rim light, light walls, dark floor. */
function environment(dx: number, dy: number, dz: number, out: Float64Array): void {
  const sky = 0.03 + 0.55 * smoothstep(-0.35, 0.75, dy);
  let r = sky;
  let g = sky;
  let b = sky * 1.04;
  // A bright horizon line draws the long highlight that runs along polished bands.
  const horizon = (1 - smoothstep(0.04, 0.16, Math.abs(dy - 0.05))) * 1.3;
  r += horizon;
  g += horizon;
  b += horizon;
  // Broad fill from the camera side, so faces turned to the viewer catch light.
  const front = smoothstep(0.35, 0.95, dz) * 1.1;
  r += front;
  g += front;
  b += front * 1.02;
  // Overhead soft box, slightly in front.
  const top = dx * 0.25 + dy * 0.9 + dz * 0.36;
  const box = smoothstep(0.82, 0.97, top) * 5.5;
  r += box;
  g += box;
  b += box;
  // Vertical strip lights to the left and right.
  const strip = (Math.abs(dy) < 0.65 ? 1 : 0) * (smoothstep(0.75, 0.93, Math.abs(dx)) * 3.2);
  r += strip * 1.02;
  g += strip;
  b += strip * 0.97;
  // Warm rim light behind.
  const rim = smoothstep(0.55, 0.85, -dz) * smoothstep(-0.2, 0.4, dy) * 1.6;
  r += rim * 1.08;
  g += rim * 0.98;
  b += rim * 0.85;
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

const KEY_LIGHTS: V3[] = [
  [0.35, 0.85, 0.4],
  [-0.7, 0.45, 0.55],
  [0.1, 0.3, -0.95],
];
for (const l of KEY_LIGHTS) {
  const n = Math.hypot(l[0], l[1], l[2]);
  l[0] /= n;
  l[1] /= n;
  l[2] /= n;
}

interface Material {
  stone: boolean;
  /** Opaque stones (opal, lapis lazuli…): a lit coloured surface with a sheen, no light through. */
  opaque: boolean;
  color: V3;
  rough: number;
}

function materialFor(part: JewelryModel['parts'][number], finishCode: string): Material {
  if (part.material === 'stone') {
    return { stone: true, opaque: Boolean(part.opaque), color: hexToLinear(STONE_COLORS[part.code] ?? '#DDE3FF'), rough: 0 };
  }
  const matte = /MATTE|BRUSH|SATIN|SAND/i.test(finishCode);
  return { stone: false, opaque: false, color: METAL_REFLECTANCE[part.code] ?? METAL_REFLECTANCE.YELLOW_GOLD, rough: matte ? 0.55 : 0.08 };
}

/** What the camera frames: the whole piece, or for a necklace with a pendant the pendant area. */
function framingBounds(model: JewelryModel): { min: V3; max: V3 } {
  const all = modelBounds(model);
  const decorated = model.spec.stones.length > 0 || model.spec.elements.length > 0;
  if (model.spec.itemType !== 'NECKLACE' || !decorated) return all;
  // The pendant hangs at the bottom centre; frame it with the chain running into it.
  const cut = all.min[1] + 34;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  model.parts.forEach((part) => {
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i + 1] > cut || Math.abs(p[i]) > 40) continue;
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
  });
  return Number.isFinite(min[0]) ? { min, max } : all;
}

/** Renders the model to RGBA pixels (blocking; fine for small pictures and tests). */
export function renderModel(model: JewelryModel, options: RenderOptions): RgbaImage {
  const steps = renderSteps(model, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * Renders without monopolising the process: the work runs in slices and gives the event loop a
 * turn between them, so the API keeps answering requests while a large picture renders.
 */
export async function renderModelAsync(model: JewelryModel, options: RenderOptions): Promise<RgbaImage> {
  const steps = renderSteps(model, options);
  let sliceStart = Date.now();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    if (Date.now() - sliceStart > 25) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      sliceStart = Date.now();
    }
  }
}

function* renderSteps(source: JewelryModel, options: RenderOptions): Generator<void, RgbaImage, void> {
  // Shown as the studio shows it: a ring with its head on top (the client's notes of 24.11).
  const model = turnedModel(source, viewTurn(source.spec));
  const size = Math.max(16, Math.round(options.size));
  const ss = Math.max(1, Math.min(3, Math.round(options.supersample ?? 2)));
  const W = size * ss;
  const H = size * ss;
  const transparent = options.background === 'transparent';
  const view: RenderView = { ...(VIEWS[model.spec.itemType] ?? VIEWS.RING), ...options.view };

  // Camera framing the bounding sphere (a necklace with a pendant is framed on its lower part).
  const bounds = framingBounds(model);
  const centre: V3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const radius =
    Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) / 2 || 1;
  const az = (view.azimuth * Math.PI) / 180;
  const el = (view.elevation * Math.PI) / 180;
  const fov = (view.fov * Math.PI) / 180;
  const dist = radius / Math.sin(fov / 2) / view.fill;
  const toCam: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const eye: V3 = [centre[0] + toCam[0] * dist, centre[1] + toCam[1] * dist, centre[2] + toCam[2] * dist];
  const fwd: V3 = [-toCam[0], -toCam[1], -toCam[2]];
  // right = fwd × world-up, up = right × fwd.
  let right: V3 = [-fwd[2], 0, fwd[0]];
  const rl = Math.hypot(right[0], right[1], right[2]) || 1;
  right = [right[0] / rl, right[1] / rl, right[2] / rl];
  const up: V3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const focal = H / 2 / Math.tan(fov / 2);

  // Vertex data per part: screen position, 1/depth, world position and normal.
  const parts = model.parts.map((part) => {
    const p = part.mesh.positions;
    const n = part.mesh.normals;
    const count = p.length / 3;
    const sx = new Float32Array(count);
    const sy = new Float32Array(count);
    const iz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const dx = p[i * 3] - eye[0];
      const dy = p[i * 3 + 1] - eye[1];
      const dz = p[i * 3 + 2] - eye[2];
      const cx = dx * right[0] + dy * right[1] + dz * right[2];
      const cy = dx * up[0] + dy * up[1] + dz * up[2];
      const cz = Math.max(1e-3, dx * fwd[0] + dy * fwd[1] + dz * fwd[2]);
      sx[i] = W / 2 + (cx / cz) * focal;
      sy[i] = H / 2 - (cy / cz) * focal;
      iz[i] = 1 / cz;
    }
    return { indices: part.mesh.indices, p, n, sx, sy, iz, material: materialFor(part, model.spec.finishCode) };
  });

  const depth = new Float32Array(W * H);
  const done = new Uint8Array(W * H);
  const accum = new Float32Array(size * size * 4);
  const weight = 1 / (ss * ss);
  const env = new Float64Array(3);
  const body = new Float64Array(3);
  const mapped = new Float64Array(3);

  // Rasterises every triangle; `visit(px, py, part, a, b, c, w0, w1, w2, invZ)` per covered sample.
  const raster = function* (
    visit: (index: number, part: (typeof parts)[number], a: number, b: number, c: number, w0: number, w1: number, w2: number, z: number, px: number, py: number) => void,
  ): Generator<void, void, void> {
    for (const part of parts) {
      const { indices, sx, sy, iz } = part;
      for (let t = 0; t < indices.length; t += 3) {
        if (t % 1500 === 0) yield;
        const a = indices[t];
        const b = indices[t + 1];
        const c = indices[t + 2];
        const ax = sx[a];
        const ay = sy[a];
        const bx = sx[b];
        const by = sy[b];
        const cx = sx[c];
        const cy = sy[c];
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(area) < 1e-9) continue;
        const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        if (minX > maxX || minY > maxY) continue;
        const inv = 1 / area;
        for (let py = minY; py <= maxY; py++) {
          const fy = py + 0.5;
          for (let px = minX; px <= maxX; px++) {
            const fx = px + 0.5;
            let w0 = ((bx - fx) * (cy - fy) - (by - fy) * (cx - fx)) * inv;
            let w1 = ((cx - fx) * (ay - fy) - (cy - fy) * (ax - fx)) * inv;
            let w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) {
              // Accept samples on shared edges once (tiny epsilon closes cracks).
              if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
              w0 = Math.max(0, w0);
              w1 = Math.max(0, w1);
              w2 = Math.max(0, w2);
            }
            const z = w0 * iz[a] + w1 * iz[b] + w2 * iz[c];
            visit(py * W + px, part, a, b, c, w0, w1, w2, z, px, py);
          }
        }
      }
    }
  };

  // Pass 1: nearest surface per sample.
  yield* raster((index, _part, _a, _b, _c, _w0, _w1, _w2, z) => {
    if (z > depth[index]) depth[index] = z;
  });

  // Pass 2: shade the nearest surface once per sample.
  yield* raster((index, part, a, b, c, w0, w1, w2, z, px, py) => {
    // The depth buffer holds 32-bit floats: compare at the same precision.
    if (done[index] || Math.fround(z) !== depth[index]) return;
    done[index] = 1;
    const { p, n, iz, material } = part;
    // Perspective-correct interpolation.
    const q0 = w0 * iz[a];
    const q1 = w1 * iz[b];
    const q2 = w2 * iz[c];
    const qs = 1 / (q0 + q1 + q2);
    const a3 = a * 3;
    const b3 = b * 3;
    const c3 = c * 3;
    const wx = (p[a3] * q0 + p[b3] * q1 + p[c3] * q2) * qs;
    const wy = (p[a3 + 1] * q0 + p[b3 + 1] * q1 + p[c3 + 1] * q2) * qs;
    const wz = (p[a3 + 2] * q0 + p[b3 + 2] * q1 + p[c3 + 2] * q2) * qs;
    let nx = (n[a3] * q0 + n[b3] * q1 + n[c3] * q2) * qs;
    let ny = (n[a3 + 1] * q0 + n[b3 + 1] * q1 + n[c3 + 1] * q2) * qs;
    let nz = (n[a3 + 2] * q0 + n[b3 + 2] * q1 + n[c3 + 2] * q2) * qs;
    let nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    let vx = eye[0] - wx;
    let vy = eye[1] - wy;
    let vz = eye[2] - wz;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl;
    vy /= vl;
    vz /= vl;
    let ndv = nx * vx + ny * vy + nz * vz;
    if (ndv < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
      ndv = -ndv;
    }
    // Reflection of the view direction.
    const rx = 2 * ndv * nx - vx;
    const ry = 2 * ndv * ny - vy;
    const rz = 2 * ndv * nz - vz;
    const grazing = Math.pow(1 - Math.min(1, ndv), 5);
    let r: number;
    let g: number;
    let bl: number;
    environment(rx, ry, rz, env);
    if (!material.stone) {
      const [mr, mg, mb] = material.color;
      const rough = material.rough;
      // Rough metal sees a blurred studio: blend toward its average brightness.
      const er = env[0] * (1 - rough) + 0.9 * rough;
      const eg = env[1] * (1 - rough) + 0.9 * rough;
      const eb = env[2] * (1 - rough) + 0.92 * rough;
      let spec = 0;
      const shininess = rough > 0.3 ? 40 : 380;
      for (const l of KEY_LIGHTS) {
        let hx = l[0] + vx;
        let hy = l[1] + vy;
        let hz = l[2] + vz;
        const hl = Math.hypot(hx, hy, hz) || 1;
        hx /= hl;
        hy /= hl;
        hz /= hl;
        const nh = Math.max(0, nx * hx + ny * hy + nz * hz);
        spec += Math.pow(nh, shininess) * (rough > 0.3 ? 0.8 : 3.5);
      }
      const fr = mr + (1 - mr) * grazing;
      const fg = mg + (1 - mg) * grazing;
      const fb = mb + (1 - mb) * grazing;
      r = fr * (er + spec) * 0.8;
      g = fg * (eg + spec) * 0.8;
      bl = fb * (eb + spec) * 0.8;
    } else if (material.opaque) {
      // A polished opaque stone: its colour lit by the studio, a thin glossy reflection on top.
      const [sr, sg, sb] = material.color;
      const fresnel = 0.04 + 0.5 * grazing;
      let diffuse = 0.32;
      for (const l of KEY_LIGHTS) diffuse += Math.max(0, nx * l[0] + ny * l[1] + nz * l[2]) * 0.55;
      let gloss = 0;
      for (const l of KEY_LIGHTS) gloss += Math.pow(Math.max(0, rx * l[0] + ry * l[1] + rz * l[2]), 60) * 1.2;
      r = sr * diffuse * (1 - fresnel) + env[0] * fresnel + gloss;
      g = sg * diffuse * (1 - fresnel) + env[1] * fresnel + gloss;
      bl = sb * diffuse * (1 - fresnel) + env[2] * fresnel + gloss;
    } else {
      const [sr, sg, sb] = material.color;
      const fresnel = 0.17 + 0.83 * grazing;
      // Light returned through the stone: the studio seen from inside, tinted by its colour.
      const ix = -nx * 0.7 - vx * 0.3;
      const iy = -ny * 0.7 - vy * 0.3 + 0.35;
      const izz = -nz * 0.7 - vz * 0.3;
      const il = Math.hypot(ix, iy, izz) || 1;
      environment(ix / il, iy / il, izz / il, body);
      const luminance = Math.min(2.4, (body[0] + body[1] + body[2]) / 3);
      const depthTint = 0.25 + 0.75 * luminance;
      let sparkle = 0;
      for (const l of KEY_LIGHTS) sparkle += Math.pow(Math.max(0, rx * l[0] + ry * l[1] + rz * l[2]), 90) * 6;
      r = sr * depthTint * (1 - fresnel) + env[0] * fresnel + sparkle;
      g = sg * depthTint * (1 - fresnel) + env[1] * fresnel + sparkle;
      bl = sb * depthTint * (1 - fresnel) + env[2] * fresnel + sparkle;
    }
    const o = ((Math.floor(py / ss) * size + Math.floor(px / ss)) * 4) | 0;
    toneMap(r, g, bl, mapped);
    accum[o] += mapped[0] * weight;
    accum[o + 1] += mapped[1] * weight;
    accum[o + 2] += mapped[2] * weight;
    accum[o + 3] += weight;
  });

  // Backdrop and contact shadow, then resolve to 8-bit sRGB.
  let shadow: { x: number; y: number; rx: number; ry: number } | null = null;
  if (!transparent) {
    // Project the lowest point under the piece's centre for a soft contact shadow.
    const base: V3 = [centre[0], bounds.min[1], centre[2]];
    const dx = base[0] - eye[0];
    const dy = base[1] - eye[1];
    const dz = base[2] - eye[2];
    const cz = Math.max(1e-3, dx * fwd[0] + dy * fwd[1] + dz * fwd[2]);
    const cx = dx * right[0] + dy * right[1] + dz * right[2];
    const cy = dx * up[0] + dy * up[1] + dz * up[2];
    const spread = (radius / cz) * focal;
    shadow = {
      x: (W / 2 + (cx / cz) * focal) / ss,
      y: (H / 2 - (cy / cz) * focal) / ss,
      rx: (spread * 0.95) / ss,
      ry: (spread * 0.16) / ss,
    };
  }
  const out = new Uint8Array(size * size * 4);
  const top = [0.984, 0.976, 1.0].map(srgbToLinear);
  const bottom = [0.93, 0.91, 0.975].map(srgbToLinear);
  for (let y = 0; y < size; y++) {
    if (y % 48 === 0) yield;
    const t = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const alpha = Math.min(1, accum[i + 3]);
      if (transparent) {
        if (alpha > 0) {
          out[i] = Math.round(linearToSrgb(accum[i] / alpha) * 255);
          out[i + 1] = Math.round(linearToSrgb(accum[i + 1] / alpha) * 255);
          out[i + 2] = Math.round(linearToSrgb(accum[i + 2] / alpha) * 255);
        }
        out[i + 3] = Math.round(alpha * 255);
        continue;
      }
      let br = top[0] + (bottom[0] - top[0]) * t;
      let bg = top[1] + (bottom[1] - top[1]) * t;
      let bb = top[2] + (bottom[2] - top[2]) * t;
      if (shadow) {
        const ex = (x - shadow.x) / shadow.rx;
        const ey = (y - shadow.y) / shadow.ry;
        const d = ex * ex + ey * ey;
        const shade = 1 - 0.28 * Math.exp(-d * 2.2);
        br *= shade;
        bg *= shade;
        bb *= shade;
      }
      out[i] = Math.round(linearToSrgb(accum[i] + br * (1 - alpha)) * 255);
      out[i + 1] = Math.round(linearToSrgb(accum[i + 1] + bg * (1 - alpha)) * 255);
      out[i + 2] = Math.round(linearToSrgb(accum[i + 2] + bb * (1 - alpha)) * 255);
      out[i + 3] = 255;
    }
  }
  const image: RgbaImage = { width: size, height: size, data: out };
  if (options.watermark) stampWatermark(image, options.watermark);
  return image;
}

/** Blends `mark` (scaled to a fifth of the width, 45 % opacity) into the lower-right corner. */
export function stampWatermark(image: RgbaImage, mark: RgbaImage): void {
  const targetW = Math.max(8, Math.round(image.width * 0.22));
  const scaleK = targetW / mark.width;
  const targetH = Math.max(4, Math.round(mark.height * scaleK));
  const margin = Math.round(image.width * 0.03);
  const x0 = image.width - targetW - margin;
  const y0 = image.height - targetH - margin;
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(mark.width - 1, Math.floor(x / scaleK));
      const sy = Math.min(mark.height - 1, Math.floor(y / scaleK));
      const s = (sy * mark.width + sx) * 4;
      const a = (mark.data[s + 3] / 255) * 0.45;
      if (a <= 0) continue;
      const d = ((y0 + y) * image.width + (x0 + x)) * 4;
      if (d < 0 || d >= image.data.length) continue;
      for (let k = 0; k < 3; k++) image.data[d + k] = Math.round(image.data[d + k] * (1 - a) + mark.data[s + k] * a);
      image.data[d + 3] = Math.max(image.data[d + 3], Math.round(a * 255));
    }
  }
}
