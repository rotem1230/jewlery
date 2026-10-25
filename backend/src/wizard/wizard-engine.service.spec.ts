import Ajv from 'ajv';
import { PrismaService } from '../database/prisma.service';
import { WizardEngineService } from './wizard-engine.service';

const SCHEMA = {
  type: 'object',
  required: ['size'],
  properties: { size: { type: 'object' } },
};

/** Prisma returns a fresh object graph on every query; the fake does the same. */
function prismaReturning(updatedAt: () => Date) {
  return {
    itemType: {
      findUnique: async () => ({
        id: 'item-1',
        code: 'RING',
        config: {
          id: 'config-1',
          itemTypeId: 'item-1',
          parametersSchema: JSON.parse(JSON.stringify(SCHEMA)),
          compatibilityRules: [],
          updatedAt: updatedAt(),
        },
      }),
    },
    setting: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        where.code === 'BRIGHT_CUT' ? { code: 'BRIGHT_CUT', minBandWidthMm: 2.5 } : null,
    },
  } as unknown as PrismaService;
}

describe('WizardEngineService.validateParameters', () => {
  afterEach(() => jest.restoreAllMocks());

  it('compiles an unchanged item-type schema once, not on every validation', async () => {
    const compile = jest.spyOn(Ajv.prototype, 'compile');
    const stamp = new Date('2026-01-01T00:00:00Z');
    const wizard = new WizardEngineService(prismaReturning(() => stamp));

    for (let i = 0; i < 5; i += 1) {
      await wizard.validateParameters('item-1', { size: {} });
    }
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it('recompiles when the schema version changes', async () => {
    const compile = jest.spyOn(Ajv.prototype, 'compile');
    let stamp = new Date('2026-01-01T00:00:00Z');
    const wizard = new WizardEngineService(prismaReturning(() => stamp));

    await wizard.validateParameters('item-1', { size: {} });
    stamp = new Date('2026-02-01T00:00:00Z');
    await wizard.validateParameters('item-1', { size: {} });
    expect(compile).toHaveBeenCalledTimes(2);
  });

  it('still rejects invalid parameters from a cached validator', async () => {
    const stamp = new Date('2026-01-01T00:00:00Z');
    const wizard = new WizardEngineService(prismaReturning(() => stamp));
    await wizard.validateParameters('item-1', { size: {} });
    const result = await wizard.validateParameters('item-1', {});
    expect(result.valid).toBe(false);
  });

  it('keeps to the client catalogue: a cut the stone does not come in is refused', async () => {
    const wizard = new WizardEngineService(prismaReturning(() => new Date('2026-01-01T00:00:00Z')));
    const result = await wizard.validateParameters('item-1', { size: {}, stones: [{ stoneCode: 'OPAL', cutCode: 'ROUND' }] });
    expect(result).toEqual({ valid: false, errors: ['/stones/0/cutCode OPAL comes only as CABOCHON, CABOCHON_OVAL'] });
  });

  it('a head chosen as headCode needs its minimum band width, as the older settingCode did', async () => {
    const wizard = new WizardEngineService(prismaReturning(() => new Date('2026-01-01T00:00:00Z')));
    const narrow = await wizard.validateParameters('item-1', { size: { bandWidthMm: 2 }, setting: { headCode: 'BRIGHT_CUT' } });
    expect(narrow.errors).toEqual(['Band width 2mm is below the minimum 2.5mm required by setting "BRIGHT_CUT"']);
    expect((await wizard.validateParameters('item-1', { size: { bandWidthMm: 2.5 }, setting: { headCode: 'BRIGHT_CUT' } })).valid).toBe(true);
    // No head: nothing to hold.
    expect((await wizard.validateParameters('item-1', { size: { bandWidthMm: 1 }, setting: { headCode: 'NONE', settingCode: 'BRIGHT_CUT' } })).valid).toBe(true);
  });
});
