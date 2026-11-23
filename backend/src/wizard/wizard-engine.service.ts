import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemType, ItemTypeConfig } from '@prisma/client';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import { PrismaService } from '../database/prisma.service';
import { MAX_ELEMENTS, MAX_STONES } from '../jewelry/geometry';
import { catalogErrors } from '../jewelry/parameters-check';

export type ItemTypeWithConfig = ItemType & { config: ItemTypeConfig | null };

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

type CompatibilityRule = {
  when?: Record<string, unknown>;
  require?: Record<string, unknown>;
  messageKey?: string;
};

/** Bound on cached validators (one per item-type config version). */
const MAX_CACHED_VALIDATORS = 100;

@Injectable()
export class WizardEngineService {
  /**
   * Compiled JSON-schema validators keyed by config id + updatedAt. Compiling on every design
   * autosave was slow and grew Ajv's internal cache without bound (it caches by object identity,
   * and Prisma returns a new object each time). Each entry owns its Ajv instance, so evicting the
   * entry releases everything it compiled.
   */
  private readonly validators = new Map<string, ValidateFunction>();

  constructor(private readonly prisma: PrismaService) {}

  private validatorFor(config: ItemTypeConfig): ValidateFunction {
    const key = `${config.id}:${new Date(config.updatedAt).getTime()}`;
    let validate = this.validators.get(key);
    if (!validate) {
      if (this.validators.size >= MAX_CACHED_VALIDATORS) {
        this.validators.clear();
      }
      validate = new Ajv({ allErrors: true, strict: false }).compile(config.parametersSchema as object);
      this.validators.set(key, validate);
    }
    return validate;
  }

  async loadItemTypeByCode(code: string): Promise<ItemTypeWithConfig> {
    const itemType = await this.prisma.itemType.findUnique({
      where: { code },
      include: { config: true },
    });
    if (!itemType) {
      throw new NotFoundException({ success: false, message: `Unknown item type "${code}"` });
    }
    return itemType;
  }

  async loadConfig(itemTypeId: string): Promise<ItemTypeWithConfig> {
    const itemType = await this.prisma.itemType.findUnique({
      where: { id: itemTypeId },
      include: { config: true },
    });
    if (!itemType) {
      throw new NotFoundException({ success: false, message: 'Unknown item type' });
    }
    return itemType;
  }

  /** Get a nested value from an object using a dot-separated path (e.g. "size.bandWidthMm"). */
  private getByPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private matchesAll(parameters: unknown, expectations: Record<string, unknown>): boolean {
    return Object.entries(expectations).every(
      ([path, expected]) => this.getByPath(parameters, path) === expected,
    );
  }

  /**
   * Runs the free-form `compatibilityRules` JSON stored on ItemTypeConfig, matching
   * `when` key/value expectations against `parameters` and requiring `require`
   * key/value expectations to also hold. Best-effort / pragmatic — rules that don't
   * fit this simple shape are skipped rather than erroring.
   */
  private runCompatibilityRules(parameters: Record<string, unknown>, rules: unknown): string[] {
    const errors: string[] = [];
    if (!Array.isArray(rules)) {
      return errors;
    }
    for (const raw of rules as CompatibilityRule[]) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const when = raw.when;
      const require = raw.require;
      if (when && !this.matchesAll(parameters, when)) {
        continue;
      }
      if (require && !this.matchesAll(parameters, require)) {
        errors.push(raw.messageKey ?? 'Parameters do not satisfy compatibility rule');
      }
    }
    return errors;
  }

  /**
   * Concrete, DB-driven compatibility check: the centre stone head's `minBandWidthMm`
   * (if configured) must not exceed the design's chosen band width. The head is `headCode`
   * ("NONE": no head), or `settingCode` in older designs.
   */
  private async checkBandWidthVsSetting(parameters: Record<string, unknown>): Promise<string[]> {
    const headCode = this.getByPath(parameters, 'setting.headCode');
    const settingCode = headCode ?? this.getByPath(parameters, 'setting.settingCode');
    const bandWidthMm = this.getByPath(parameters, 'size.bandWidthMm');
    if (typeof settingCode !== 'string' || settingCode === 'NONE' || typeof bandWidthMm !== 'number') {
      return [];
    }
    const setting = await this.prisma.setting.findUnique({ where: { code: settingCode } });
    if (!setting || setting.minBandWidthMm === null || setting.minBandWidthMm === undefined) {
      return [];
    }
    const minBandWidthMm = Number(setting.minBandWidthMm);
    if (bandWidthMm < minBandWidthMm) {
      return [
        `Band width ${bandWidthMm}mm is below the minimum ${minBandWidthMm}mm required by setting "${settingCode}"`,
      ];
    }
    return [];
  }

  /**
   * A metal or purity chosen now must be one on offer (12K gold and platinum no longer are: the
   * client's notes of 23.11.2026); one the catalogue does not know is refused too. A design saved
   * in a metal and purity before keeps them.
   */
  private async checkMetalOffered(parameters: Record<string, unknown>, previous: unknown): Promise<string[]> {
    const metalCode = this.getByPath(parameters, 'metal.metalCode');
    const purityCode = this.getByPath(parameters, 'metal.purityCode');
    if (typeof metalCode !== 'string') {
      return [];
    }
    if (this.getByPath(previous, 'metal.metalCode') === metalCode && this.getByPath(previous, 'metal.purityCode') === purityCode) {
      return [];
    }
    const metal = await this.prisma.metal.findUnique({ where: { code: metalCode }, include: { purities: true } });
    if (!metal || !metal.isActive) {
      return [`/metal/metalCode ${metalCode} is not offered`];
    }
    if (typeof purityCode === 'string' && !metal.purities.some((p) => p.code === purityCode && p.isActive)) {
      return [`/metal/purityCode ${purityCode} is not offered for ${metalCode}`];
    }
    return [];
  }

  /**
   * `previous`: the design's saved parameters. A rule that came after a choice was saved (a stone's
   * own colours, a ring size range, a metal no longer offered) holds only for what is chosen now.
   */
  async validateParameters(itemTypeId: string, parameters: unknown, previous?: unknown): Promise<ValidationResult> {
    const itemType = await this.loadConfig(itemTypeId);
    const errors: string[] = [];

    // Hard bounds whatever the item type's schema says: every design is built into a mesh.
    const raw = (parameters ?? {}) as Record<string, unknown>;
    if (Array.isArray(raw.stones) && raw.stones.length > MAX_STONES) {
      return { valid: false, errors: [`/stones must have at most ${MAX_STONES} items`] };
    }
    if (Array.isArray(raw.elements) && raw.elements.length > MAX_ELEMENTS) {
      return { valid: false, errors: [`/elements must have at most ${MAX_ELEMENTS} items`] };
    }

    // The client catalogue (cuts, colours, sizes, heads, band styles), whatever the item type's
    // schema; and the metals on offer.
    const catalog = [...catalogErrors(itemType.code, raw, previous), ...(await this.checkMetalOffered(raw, previous))];
    if (!itemType.config) {
      // No schema configured yet for this item type: only the catalogue applies.
      return { valid: catalog.length === 0, errors: catalog };
    }
    errors.push(...catalog);

    if (itemType.config.parametersSchema) {
      const validateFn = this.validatorFor(itemType.config);
      const ok = validateFn(parameters);
      if (!ok) {
        errors.push(
          ...((validateFn.errors ?? []) as ErrorObject[]).map(
            (e) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`,
          ),
        );
      }
    }

    const params = (parameters ?? {}) as Record<string, unknown>;
    errors.push(...this.runCompatibilityRules(params, itemType.config.compatibilityRules));
    errors.push(...(await this.checkBandWidthVsSetting(params)));

    return { valid: errors.length === 0, errors };
  }

  async sizeCharts(itemTypeCode: string) {
    const itemType = await this.loadItemTypeByCode(itemTypeCode);
    return this.prisma.sizeChart.findMany({
      where: { itemTypeId: itemType.id, isActive: true },
      orderBy: [{ standard: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async listItemTypes() {
    return this.prisma.itemType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { config: true },
    });
  }
}
