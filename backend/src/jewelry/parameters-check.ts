import {
  BAND_STONE_SIZES_MM,
  CUTS,
  EARRING_ORBIT_MAX_MM,
  MAX_ELEMENT_TEXT,
  MAX_ROTATION_DEG,
  STONE_MIN_MM,
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
 * The client catalogue's rules for design parameters: cuts each stone comes in, chart colours,
 * stones from 2 mm to 1.5 ct, element sizes and texts, the heads and band styles of the pictures,
 * the pavé table. Only what is there is checked: older designs (a `shape`, x/y/z placements, prong
 * settings, the round initial) and codes the catalogue does not know (stones an admin added) pass.
 * Errors read like the JSON-schema ones ("/stones/0/cutCode …").
 */
export function catalogErrors(itemType: string, parameters: unknown): string[] {
  const params = record(parameters);
  if (!params) return [];
  const errors: string[] = [];
  if (Array.isArray(params.stones)) params.stones.forEach((s, i) => stoneErrors(record(s), `/stones/${i}`, errors));
  if (Array.isArray(params.elements)) params.elements.forEach((e, i) => elementErrors(record(e), `/elements/${i}`, errors));
  const setting = record(params.setting);
  if (setting) settingErrors(itemType, setting, record(params.size), errors);
  return errors;
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

function stoneErrors(stone: Record<string, unknown> | null, path: string, errors: string[]): void {
  if (!stone) return;
  placementErrors(stone.placement, `${path}/placement`, errors);
  colorErrors(stone.colorCode, `${path}/colorCode`, errors);
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

function settingErrors(itemType: string, setting: Record<string, unknown>, size: Record<string, unknown> | null, errors: string[]): void {
  const headCode = setting.headCode;
  if (headCode !== undefined && headCode !== null && headCode !== 'NONE' && settingDef(headCode)?.kind !== 'HEAD') {
    errors.push('/setting/headCode is not a head of the catalogue');
  }
  const band = record(setting.band);
  if (!band) return;
  if (itemType !== 'RING') {
    errors.push('/setting/band is for rings only');
    return;
  }
  const def = settingDef(band.settingCode);
  if (def?.kind !== 'BAND') {
    errors.push('/setting/band/settingCode is not a band setting of the catalogue');
    return;
  }
  if (band.stoneCode !== undefined && band.stoneCode !== null && !stoneDef(band.stoneCode)) {
    errors.push('/setting/band/stoneCode is not a stone of the catalogue');
  }
  colorErrors(band.colorCode, '/setting/band/colorCode', errors);
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
