import { PrismaService } from '../database/prisma.service';
import { CUTS, elementDef, elementText, paletteColor, settingDef, stoneDef } from '../jewelry/catalog';
import { MAX_ELEMENTS, MAX_STONES } from '../jewelry/geometry';

/** The designer's choices, in words for the AI picture (only what was chosen; nothing assumed). */
export type DesignChoices = {
  metal?: string;
  stones: string[];
  setting?: string;
  /** A band setting: a row of stones along a ring band. */
  band?: string;
  /** A ring's shank other than a single band (split, double, triple). */
  shank?: string;
  finish?: string;
  elements: string[];
};

/** English catalog names by code. */
export type ChoiceCatalog = {
  metals: Record<string, string>;
  settings: Record<string, string>;
  stones: Record<string, string>;
  finishes: Record<string, string>;
  elements: Record<string, string>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function code(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The catalog's English name, else the client catalogue's, else the code in words (BLACK_ONYX →
 * "black onyx"), in lower case.
 */
function name(names: Record<string, string>, value: string, fallback?: string | null): string {
  return (names[value] ?? fallback ?? value.replace(/[_-]+/g, ' ')).trim().toLowerCase();
}

/** A setting's name without its notes in brackets ("Pavé (2 or more rows)" → "pavé"). */
function settingName(names: Record<string, string>, value: string): string {
  return name(names, value, settingDef(value)?.labelEn).replace(/\s*\([^)]*\)/g, '').trim();
}

/** How a cut reads before the stone's name ("" for a round brilliant, the usual cut). */
const CUT_WORDS: Record<string, string> = {
  OVAL: 'oval',
  EMERALD: 'emerald-cut',
  CABOCHON: 'cabochon',
  CABOCHON_OVAL: 'oval cabochon',
  ROSE: 'rose-cut',
  PRINCESS: 'princess-cut',
  CUSHION: 'cushion-cut',
  ASSCHER: 'asscher-cut',
  RADIANT: 'radiant-cut',
  PEAR: 'pear-shaped',
  MARQUISE: 'marquise',
  HEART: 'heart-shaped',
  BAGUETTE: 'baguette',
  TRILLION: 'trillion-cut',
};

/** A ring's shank in words (a single band goes without saying). */
const SHANK_WORDS: Record<string, string> = {
  SPLIT: 'split shank',
  DOUBLE: 'double shank (two bands side by side)',
  TRIPLE: 'triple shank (three bands side by side)',
};

function cutWords(value: string | null): string {
  if (!value) return '';
  const cut = value.toUpperCase();
  if (CUT_WORDS[cut]) return CUT_WORDS[cut];
  return CUTS.some((c) => c.code === cut) ? '' : value.toLowerCase();
}

/** Reads the metal, stones, setting, finish and elements of design parameters (PRD 5.4 steps 3–6). */
export function describeChoices(parameters: unknown, catalog: ChoiceCatalog): DesignChoices {
  const params = record(parameters) ?? {};
  const choices: DesignChoices = { stones: [], elements: [] };

  const metal = record(params.metal);
  const metalCode = code(metal?.metalCode);
  if (metalCode) {
    const purity = code(metal?.purityCode);
    choices.metal = `${purity ? `${purity} ` : ''}${name(catalog.metals, metalCode)}`;
  }

  if (Array.isArray(params.stones)) {
    for (const item of params.stones.slice(0, MAX_STONES)) {
      const stone = record(item);
      const stoneCode = code(stone?.stoneCode);
      if (!stoneCode) continue;
      const cut = cutWords(code(stone?.cutCode) ?? code(stone?.shape));
      // A chart colour other than the stone's own is said; its own colour goes without saying.
      const color = paletteColor(code(stone?.colorCode)?.toUpperCase());
      const ownColor = stoneDef(stoneCode)?.defaultColor;
      const colorWords = color && color.code !== ownColor ? ` in ${color.name.toLowerCase()} colour` : '';
      const words = `${cut ? `${cut} ` : ''}${name(catalog.stones, stoneCode, stoneDef(stoneCode)?.nameEn)}${colorWords}`;
      if (!choices.stones.includes(words)) choices.stones.push(words);
    }
  }

  const setting = record(params.setting);
  // The head (`headCode`, or the older `settingCode`); "NONE" is a centre stone without a head.
  const headCode = code(setting?.headCode) ?? code(setting?.settingCode);
  if (headCode && headCode.toUpperCase() !== 'NONE') choices.setting = `${settingName(catalog.settings, headCode)} setting`;
  const band = record(setting?.band);
  const bandCode = code(band?.settingCode);
  if (bandCode) {
    const bandStone = code(band?.stoneCode) ?? 'DIAMOND';
    const rows = typeof band?.rows === 'number' && band.rows > 1 ? ` in ${Math.round(band.rows)} rows` : '';
    choices.band = `${settingName(catalog.settings, bandCode)} band set with ${name(catalog.stones, bandStone, stoneDef(bandStone)?.nameEn)} stones${rows}`;
  }

  const shank = code(record(params.size)?.shankStyle)?.toUpperCase();
  if (shank && SHANK_WORDS[shank]) choices.shank = SHANK_WORDS[shank];

  const finishCode = code(params.finishCode);
  if (finishCode) choices.finish = `${name(catalog.finishes, finishCode)} finish`;

  if (Array.isArray(params.elements)) {
    for (const item of params.elements.slice(0, MAX_ELEMENTS)) {
      const element = record(item);
      const elementCode = code(element?.elementCode);
      if (!elementCode) continue;
      const def = elementDef(elementCode);
      const text = elementText(def, element?.text);
      const variant = def && typeof element?.variant === 'string' && def.variants.includes(element.variant) ? `${element.variant.toLowerCase()} ` : '';
      const words = `${variant}${name(catalog.elements, elementCode, def?.labelEn)}${text ? ` "${text}"` : ''}`;
      if (!choices.elements.includes(words)) choices.elements.push(words);
    }
  }
  return choices;
}

/** The English names of the catalog, keyed by code (a missing English name falls back to the code). */
export async function loadChoiceCatalog(prisma: PrismaService): Promise<ChoiceCatalog> {
  const [metals, settings, stones, finishes, elements] = await Promise.all([
    prisma.metal.findMany({ select: { code: true, labelEn: true } }),
    prisma.setting.findMany({ select: { code: true, labelEn: true } }),
    prisma.stone.findMany({ select: { code: true, nameEn: true } }),
    prisma.finishType.findMany({ select: { code: true, labelEn: true } }),
    prisma.elementCatalog.findMany({ select: { code: true, labelEn: true } }),
  ]);
  const byCode = (rows: Array<{ code: string; label: string | null }>) =>
    Object.fromEntries(rows.filter((row) => row.label).map((row) => [row.code, row.label as string]));
  return {
    metals: byCode(metals.map((m) => ({ code: m.code, label: m.labelEn }))),
    settings: byCode(settings.map((s) => ({ code: s.code, label: s.labelEn }))),
    stones: byCode(stones.map((s) => ({ code: s.code, label: s.nameEn }))),
    finishes: byCode(finishes.map((f) => ({ code: f.code, label: f.labelEn }))),
    elements: byCode(elements.map((e) => ({ code: e.code, label: e.labelEn }))),
  };
}
