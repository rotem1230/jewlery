import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemType, ItemTypeConfig } from '@prisma/client';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import { PrismaService } from '../database/prisma.service';
import { MAX_ELEMENTS, MAX_STONES } from '../jewelry/geometry';

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
   * Concrete, DB-driven compatibility check: a stone setting's `minBandWidthMm`
   * (if configured) must not exceed the design's chosen band width.
   */
  private async checkBandWidthVsSetting(parameters: Record<string, unknown>): Promise<string[]> {
    const settingCode = this.getByPath(parameters, 'setting.settingCode');
    const bandWidthMm = this.getByPath(parameters, 'size.bandWidthMm');
    if (typeof settingCode !== 'string' || typeof bandWidthMm !== 'number') {
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

  async validateParameters(itemTypeId: string, parameters: unknown): Promise<ValidationResult> {
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

    if (!itemType.config) {
      // No schema configured yet for this item type — accept as-is.
      return { valid: true, errors: [] };
    }

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
