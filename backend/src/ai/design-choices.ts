import { PrismaService } from '../database/prisma.service';
import { MAX_ELEMENTS, MAX_STONES } from '../jewelry/geometry';

/** The designer's choices, in words for the AI picture (only what was chosen; nothing assumed). */
export type DesignChoices = {
  metal?: string;
  stones: string[];
  setting?: string;
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

/** The catalog's English name, or the code in words (BLACK_ONYX → "black onyx"), in lower case. */
function name(names: Record<string, string>, value: string): string {
  return (names[value] ?? value.replace(/[_-]+/g, ' ')).trim().toLowerCase();
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
      const shape = code(stone?.shape)?.toLowerCase();
      const words = `${shape && shape !== 'round' ? `${shape} ` : ''}${name(catalog.stones, stoneCode)}`;
      if (!choices.stones.includes(words)) choices.stones.push(words);
    }
  }

  const settingCode = code(record(params.setting)?.settingCode);
  if (settingCode) choices.setting = `${name(catalog.settings, settingCode)} setting`;

  const finishCode = code(params.finishCode);
  if (finishCode) choices.finish = `${name(catalog.finishes, finishCode)} finish`;

  if (Array.isArray(params.elements)) {
    for (const item of params.elements.slice(0, MAX_ELEMENTS)) {
      const elementCode = code(record(item)?.elementCode);
      if (!elementCode) continue;
      const words = name(catalog.elements, elementCode);
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
