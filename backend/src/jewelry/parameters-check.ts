import {
  BAND_STONE_SIZES_MM,
  CUSTOM_RING_SIZE_MAX_IL,
  CUSTOM_RING_SIZE_MIN_IL,
  CUTS,
  EARRING_ORBIT_MAX_MM,
  MAX_ELEMENT_TEXT,
  MAX_ROTATION_DEG,
  SHANK_STYLES,
  STONE_MIN_MM,
  allowedColors,
  allowedCuts,
  bandWidthForStonesMm,
  elementDef,
  elementText,
  paletteColor,
  settingDef,
  stoneDef,
  stoneMaxMm,
  type CutCode,
} from './catalog';
import { MAX_BAND_STONES } from './geometry';

/**
 * The client catalogue's rules for design parameters: cuts each stone comes in, the colours each
 * stone comes in, stones from 2 mm to 1.5 ct, element sizes and texts, the heads and band styles of
 * the pictures, the pavé table, the ring's shank and size. Only what is there is checked: older
 * designs (a `shape`, x/y/z placements, prong settings, the round initial) and codes the catalogue
 * does not know (stones an admin added) pass. A rule that came after a design was saved (a stone's
 * own colours, the size range: the client's notes of 23.11.2026) holds only for what is chosen now:
 * `previous` (the saved parameters) keeps what was saved before. Errors read like the JSON-schema
 * ones ("/stones/0/cutCode …").
 */
export function catalogErrors(itemType: string, parameters: unknown, previous?: unknown): string[] {
  const params = record(parameters);
  if (!params) return [];
  const before = record(previous);
  const errors: string[] = [];
  // Each saved (stone, colour) pair excuses one stone of the new parameters: a stone added now in
  // the same colour is a new choice, checked.
  const saved = new Map<string, number>();
  if (Array.isArray(before?.stones)) {
    for (const s of before.stones) {
      const key = colorKey(record(s));
      if (key) saved.set(key, (saved.get(key) ?? 0) + 1);
    }
  }
  if (Array.isArray(params.stones)) params.stones.forEach((s, i) => stoneErrors(record(s), `/stones/${i}`, errors, saved));
  if (Array.isArray(params.elements)) params.elements.forEach((e, i) => elementErrors(record(e), `/elements/${i}`, errors));
  const size = record(params.size);
  if (size) sizeErrors(itemType, size, record(before?.size), errors);
  const setting = record(params.setting);
  if (setting) settingErrors(itemType, setting, size, record(record(before?.setting)?.band), errors);
  return errors;
}

/** "DIAMOND:RUBY": a stone's kind and colour, as saved. */
function colorKey(stone: Record<string, unknown> | null): string | null {
  if (!stone || typeof stone.stoneCode !== 'string' || typeof stone.colorCode !== 'string') return null;
  return `${stone.stoneCode}:${stone.colorCode.toUpperCase()}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Up to two decimals ("7.3", "4.95"). */
function mm(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A number field: absent is fine; otherwise a finite number inside [min, max]. */
function numberErrors(value: unknown, path: string, min: number, max: number, range: string, errors: string[]): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${path} must be a number`);
  else if (value < min - 1e-9 || value > max + 1e-9) errors.push(`${path} must be ${range}`);
}

function colorErrors(value: unknown, path: string, errors: string[]): void {
  if (value === undefined || value === null) return;
  if (!paletteColor(typeof value === 'string' ? value.toUpperCase() : null)) errors.push(`${path} is not a colour of the chart`);
}

function placementErrors(value: unknown, path: string, errors: string[]): void {
  const p = record(value);
  if (!p) return;
  numberErrors(p.angleDeg, `${path}/angleDeg`, 0, 360, '0–360', errors);
  numberErrors(p.offsetMm, `${path}/offsetMm`, -EARRING_ORBIT_MAX_MM, EARRING_ORBIT_MAX_MM, `-${EARRING_ORBIT_MAX_MM}–${EARRING_ORBIT_MAX_MM}`, errors);
  numberErrors(p.rotationDeg, `${path}/rotationDeg`, -MAX_ROTATION_DEG, MAX_ROTATION_DEG, `-${MAX_ROTATION_DEG}–${MAX_ROTATION_DEG}`, errors);
}

/**
 * A stone of the catalogue only in a colour it comes in — unless the same stone in the same colour
 * was saved before (`saved`: pairs not yet matched; one is used up per stone).
 */
function stoneColorErrors(stoneCode: unknown, colorCode: unknown, path: string, errors: string[], saved: Map<string, number>): void {
  if (typeof colorCode !== 'string' || !paletteColor(colorCode.toUpperCase())) return;
  // A stone the catalogue does not know (an admin's own) takes any chart colour, but no effect.
  const code = stoneDef(stoneCode)?.code ?? (typeof stoneCode === 'string' ? stoneCode : '');
  if (!code) return;
  const color = colorCode.toUpperCase();
  if (allowedColors(code).includes(color)) return;
  const key = `${code}:${color}`;
  const left = saved.get(key) ?? 0;
  if (left > 0) {
    saved.set(key, left - 1);
    return;
  }
  errors.push(`${path} ${color} is not a colour ${code} comes in`);
}

function stoneErrors(stone: Record<string, unknown> | null, path: string, errors: string[], saved: Map<string, number>): void {
  if (!stone) return;
  placementErrors(stone.placement, `${path}/placement`, errors);
  colorErrors(stone.colorCode, `${path}/colorCode`, errors);
  stoneColorErrors(stone.stoneCode, stone.colorCode, `${path}/colorCode`, errors, saved);
  const def = stoneDef(stone.stoneCode);
  let cut: CutCode | null = null;
  if (stone.cutCode !== undefined && stone.cutCode !== null) {
    const asked = typeof stone.cutCode === 'string' ? stone.cutCode.toUpperCase() : '';
    if (!CUTS.some((c) => c.code === asked)) {
      errors.push(`${path}/cutCode is not a cut of the catalogue`);
    } else if (def && !allowedCuts(def.code).includes(asked as CutCode)) {
      errors.push(`${path}/cutCode ${def.code} comes only as ${allowedCuts(def.code).join(', ')}`);
    } else {
      cut = asked as CutCode;
    }
  }
  if (!def) return;
  const max = stoneMaxMm(def.code, cut ?? allowedCuts(def.code)[0]);
  numberErrors(stone.sizeMm, `${path}/sizeMm`, STONE_MIN_MM, max, `${mm(STONE_MIN_MM)}–${mm(max)} mm (2 mm to 1.5 ct)`, errors);
}

function elementErrors(element: Record<string, unknown> | null, path: string, errors: string[]): void {
  if (!element) return;
  placementErrors(element.placement, `${path}/placement`, errors);
  // The round initial plaque of older designs has no catalogue entry of its own.
  const code = typeof element.elementCode === 'string' ? element.elementCode : '';
  const def = code === 'INITIAL' ? null : elementDef(code);
  if (!def) return;
  numberErrors(element.sizeMm, `${path}/sizeMm`, def.minMm, def.maxMm, `${mm(def.minMm)}–${mm(def.maxMm)} mm`, errors);
  if (def.text) {
    const kind = def.text === 'DIGITS' ? 'digits' : 'letters';
    // No text at all: an app version before texts (drawn as the round initial). An empty one is refused.
    if (element.text === undefined) {
      // nothing to check
    } else if (element.text === null || element.text === '') {
      errors.push(`${path}/text is required`);
    } else if (typeof element.text !== 'string' || elementText(def, element.text) !== element.text.toUpperCase()) {
      errors.push(`${path}/text may hold only ${kind} (at most ${MAX_ELEMENT_TEXT})`);
    }
  }
  if (element.variant !== undefined && element.variant !== null && !def.variants.includes(element.variant as string)) {
    errors.push(`${path}/variant must be ${def.variants.join(' or ')}`);
  }
}

/**
 * A ring's shank (one of the catalogue's) and size: an Israeli size 38–80 (to one decimal: a size
 * typed in), a US size 0–16. A size saved before passes as it is.
 */
function sizeErrors(itemType: string, size: Record<string, unknown>, before: Record<string, unknown> | null, errors: string[]): void {
  const shank = size.shankStyle;
  if (shank !== undefined && shank !== null) {
    if (itemType !== 'RING') errors.push('/size/shankStyle is for rings only');
    else if (typeof shank !== 'string' || !SHANK_STYLES.some((s) => s.code === shank)) {
      errors.push(`/size/shankStyle must be ${SHANK_STYLES.map((s) => s.code).join(', ').replace(/, ([^,]*)$/, ' or $1')}`);
    }
  }
  if (itemType !== 'RING' || size.sizeCode === undefined || size.sizeCode === null) return;
  if (before && before.sizeCode === size.sizeCode && before.standard === size.standard) return;
  const standard = typeof size.standard === 'string' ? size.standard.toUpperCase() : '';
  const code = typeof size.sizeCode === 'string' ? size.sizeCode.trim() : '';
  const n = /^\d{1,2}(\.\d{1,2})?$/.test(code) ? Number(code) : NaN;
  if (standard === 'IL' || standard === 'EU') {
    if (!(n >= CUSTOM_RING_SIZE_MIN_IL && n <= CUSTOM_RING_SIZE_MAX_IL)) {
      errors.push(`/size/sizeCode must be an Israeli size ${CUSTOM_RING_SIZE_MIN_IL}–${CUSTOM_RING_SIZE_MAX_IL}`);
    }
  } else if (standard === 'US') {
    if (!(n >= 0 && n <= 16)) errors.push('/size/sizeCode must be a US size 0–16');
  }
}

function settingErrors(
  itemType: string,
  setting: Record<string, unknown>,
  size: Record<string, unknown> | null,
  savedBand: Record<string, unknown> | null,
  errors: string[],
): void {
  const headCode = setting.headCode;
  if (headCode !== undefined && headCode !== null && headCode !== 'NONE' && settingDef(headCode)?.kind !== 'HEAD') {
    errors.push('/setting/headCode is not a head of the catalogue');
  }
  const band = record(setting.band);
  if (!band) {
    // An older design's band is its setting itself ("PAVE"), as the geometry reads it: a split
    // shank carries none either.
    const older = (typeof headCode === 'string' && headCode.trim()) || setting.settingCode;
    const code = typeof older === 'string' ? older.trim().toUpperCase() : '';
    if (itemType === 'RING' && size?.shankStyle === 'SPLIT' && settingDef(code)?.kind === 'BAND') {
      errors.push('/setting/band is not available on a split shank');
    }
    return;
  }
  if (itemType !== 'RING') {
    errors.push('/setting/band is for rings only');
    return;
  }
  const def = settingDef(band.settingCode);
  if (def?.kind !== 'BAND') {
    errors.push('/setting/band/settingCode is not a band setting of the catalogue');
    return;
  }
  // A split shank's two arms carry no row of stones (the geometry sets bands on whole bands only).
  if (size?.shankStyle === 'SPLIT') errors.push('/setting/band is not available on a split shank');
  if (band.stoneCode !== undefined && band.stoneCode !== null && !stoneDef(band.stoneCode)) {
    errors.push('/setting/band/stoneCode is not a stone of the catalogue');
  }
  colorErrors(band.colorCode, '/setting/band/colorCode', errors);
  // A band saved with no stone kind was a diamond (as it is checked now).
  const savedKey = colorKey(savedBand && { ...savedBand, stoneCode: savedBand.stoneCode ?? 'DIAMOND' });
  stoneColorErrors(band.stoneCode ?? 'DIAMOND', band.colorCode, '/setting/band/colorCode', errors, new Map(savedKey ? [[savedKey, 1]] : []));
  const stoneMm = band.stoneSizeMm;
  if (stoneMm !== undefined && stoneMm !== null && !BAND_STONE_SIZES_MM.includes(stoneMm as number)) {
    errors.push(`/setting/band/stoneSizeMm must be one of ${BAND_STONE_SIZES_MM.join(', ')}`);
  }
  const rows = band.rows;
  if (rows !== undefined && rows !== null && (!Number.isInteger(rows) || (rows as number) < def.minRows || (rows as number) > def.maxRows)) {
    errors.push(`/setting/band/rows must be ${def.minRows === def.maxRows ? def.minRows : `${def.minRows}–${def.maxRows}`}`);
  }
  const count = band.count;
  if (count !== undefined && count !== null && (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_BAND_STONES)) {
    errors.push(`/setting/band/count must be 1–${MAX_BAND_STONES}`);
  }
  placementErrors(band.placement, '/setting/band/placement', errors);
  // The pavé table: the band is at least as wide as its rows of stones need.
  const width = size?.bandWidthMm;
  if (typeof width === 'number' && typeof stoneMm === 'number' && BAND_STONE_SIZES_MM.includes(stoneMm)) {
    const n = typeof rows === 'number' && Number.isInteger(rows) ? rows : def.minRows;
    const need = bandWidthForStonesMm(stoneMm, n);
    if (width < need - 1e-9) {
      errors.push(`Band width ${mm(width)}mm is below the ${mm(need)}mm ${n} ${n === 1 ? 'row' : 'rows'} of ${mm(stoneMm)}mm stones need (pavé table)`);
    }
  }
}
