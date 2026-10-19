/**
 * Database seed.
 *  - Reference data (regions, catalogs, plans, feature flags, templates, defaults) is always seeded
 *    and idempotent. Rows an operator controls (feature flags, plan prices, app config) are
 *    created when missing and never overwritten.
 *  - Demo data (accounts with published passwords, showcase profiles, chats, promotions) is seeded
 *    only with SEED_DEMO_DATA=true, and refused in production.
 */
import { BillingCycle, ContentPageStatus, DesignStatus, Prisma, PrismaClient, ProfilePublishStatus, PromotionEntityType, PromotionSource, SubscriptionStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_APP_CONFIGS } from '../src/cms/app-config.constants';

const prisma = new PrismaClient();
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === 'true';

async function seedAppConfigDefaults() {
  const created = await prisma.appConfig.createMany({
    data: DEFAULT_APP_CONFIGS.map((entry) => ({ key: entry.key, value: entry.value })),
    skipDuplicates: true,
  });
  console.log(`Seed complete: ${created.count} default AppConfig rows added`);
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash('Designer123!', 12);

  await prisma.user.upsert({
    where: { email: 'designer@dev.mailnvosky.local' },
    update: {},
    create: {
      email: 'designer@dev.mailnvosky.local',
      passwordHash,
      firstName: 'Keren',
      lastName: 'Designer',
      roles: [UserRole.DESIGNER],
      activeRole: UserRole.DESIGNER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: 'jeweler@dev.mailnvosky.local' },
    update: {},
    create: {
      email: 'jeweler@dev.mailnvosky.local',
      passwordHash: await bcrypt.hash('Jeweler123!', 12),
      firstName: 'Michael',
      lastName: 'Jeweler',
      roles: [UserRole.JEWELER],
      activeRole: UserRole.JEWELER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('Seed complete: designer@dev.mailnvosky.local / Designer123!');
  console.log('Seed complete: jeweler@dev.mailnvosky.local / Jeweler123!');
}

async function seedRegions() {
  const regions: { code: string; labelHe: string; labelEn: string; sortOrder: number }[] = [
    { code: 'TEL_AVIV', labelHe: 'תל אביב', labelEn: 'Tel Aviv', sortOrder: 1 },
    { code: 'JERUSALEM', labelHe: 'ירושלים', labelEn: 'Jerusalem', sortOrder: 2 },
    { code: 'HAIFA', labelHe: 'חיפה', labelEn: 'Haifa', sortOrder: 3 },
    { code: 'NORTH', labelHe: 'צפון', labelEn: 'North', sortOrder: 4 },
    { code: 'SOUTH', labelHe: 'דרום', labelEn: 'South', sortOrder: 5 },
    { code: 'CENTER', labelHe: 'מרכז', labelEn: 'Center', sortOrder: 6 },
  ];

  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: {},
      create: region,
    });
  }
  console.log(`Seed complete: ${regions.length} regions`);
}

type ItemTypeSeed = {
  code: string;
  labelHe: string;
  labelEn: string;
  sortOrder: number;
  steps: Prisma.InputJsonValue;
  parametersSchema: Prisma.InputJsonValue;
  lockFields: string[];
  defaults: Prisma.InputJsonValue;
};

function ringItemType(): ItemTypeSeed {
  return {
    code: 'RING',
    labelHe: 'טבעת',
    labelEn: 'Ring',
    sortOrder: 1,
    steps: [
      { key: 'size', order: 1, lockable: true },
      { key: 'metal', order: 2, lockable: true },
      { key: 'setting', order: 3, lockable: false },
      { key: 'stones', order: 4, lockable: false },
      { key: 'elements', order: 5, lockable: false },
      { key: 'finish', order: 6, lockable: false },
      { key: 'review', order: 7, lockable: false },
    ],
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['size', 'metal'],
      properties: {
        size: {
          type: 'object',
          required: ['standard', 'sizeCode'],
          properties: {
            standard: { type: 'string', enum: ['US', 'EU', 'UK', 'IL'] },
            sizeCode: { type: 'string' },
            bandWidthMm: { type: 'number', minimum: 0.5, maximum: 15 },
          },
        },
        metal: {
          type: 'object',
          required: ['metalCode'],
          properties: {
            metalCode: { type: 'string' },
            purityCode: { type: 'string' },
          },
        },
        setting: {
          type: 'object',
          properties: { settingCode: { type: 'string' } },
        },
        stoneHousing: { type: 'string' },
        stones: { type: 'array', items: { type: 'object' } },
        elements: { type: 'array', items: { type: 'object' } },
        finishCode: { type: 'string' },
        additionalStonesText: { type: 'string' },
        personalNote: { type: 'string' },
      },
      additionalProperties: true,
    },
    lockFields: ['size', 'metal'],
    defaults: { finishCode: 'POLISHED' },
  };
}

function necklaceItemType(): ItemTypeSeed {
  return {
    code: 'NECKLACE',
    labelHe: 'שרשרת',
    labelEn: 'Necklace',
    sortOrder: 2,
    steps: [
      { key: 'size', order: 1, lockable: true },
      { key: 'metal', order: 2, lockable: true },
      { key: 'elements', order: 3, lockable: false },
      { key: 'stones', order: 4, lockable: false },
      { key: 'finish', order: 5, lockable: false },
      { key: 'review', order: 6, lockable: false },
    ],
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['metal'],
      properties: {
        size: {
          type: 'object',
          properties: {
            necklaceLengthCm: { type: 'number', minimum: 20, maximum: 100 },
          },
        },
        metal: {
          type: 'object',
          required: ['metalCode'],
          properties: {
            metalCode: { type: 'string' },
            purityCode: { type: 'string' },
          },
        },
        stones: { type: 'array', items: { type: 'object' } },
        elements: { type: 'array', items: { type: 'object' } },
        finishCode: { type: 'string' },
        additionalStonesText: { type: 'string' },
        personalNote: { type: 'string' },
      },
      additionalProperties: true,
    },
    lockFields: ['metal'],
    defaults: { finishCode: 'POLISHED' },
  };
}

function braceletItemType(): ItemTypeSeed {
  return {
    code: 'BRACELET',
    labelHe: 'צמיד',
    labelEn: 'Bracelet',
    sortOrder: 3,
    steps: [
      { key: 'size', order: 1, lockable: true },
      { key: 'metal', order: 2, lockable: true },
      { key: 'elements', order: 3, lockable: false },
      { key: 'stones', order: 4, lockable: false },
      { key: 'finish', order: 5, lockable: false },
      { key: 'review', order: 6, lockable: false },
    ],
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['metal'],
      properties: {
        size: {
          type: 'object',
          properties: {
            wristCircumferenceCm: { type: 'number', minimum: 10, maximum: 30 },
          },
        },
        metal: {
          type: 'object',
          required: ['metalCode'],
          properties: {
            metalCode: { type: 'string' },
            purityCode: { type: 'string' },
          },
        },
        stones: { type: 'array', items: { type: 'object' } },
        elements: { type: 'array', items: { type: 'object' } },
        finishCode: { type: 'string' },
        additionalStonesText: { type: 'string' },
        personalNote: { type: 'string' },
      },
      additionalProperties: true,
    },
    lockFields: ['metal'],
    defaults: { finishCode: 'POLISHED' },
  };
}

function earringsItemType(): ItemTypeSeed {
  return {
    code: 'EARRINGS',
    labelHe: 'עגילים',
    labelEn: 'Earrings',
    sortOrder: 4,
    steps: [
      { key: 'style', order: 1, lockable: true },
      { key: 'metal', order: 2, lockable: true },
      { key: 'stones', order: 3, lockable: false },
      { key: 'elements', order: 4, lockable: false },
      { key: 'finish', order: 5, lockable: false },
      { key: 'review', order: 6, lockable: false },
    ],
    parametersSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['metal'],
      properties: {
        size: {
          type: 'object',
          properties: {
            earringStyleCode: { type: 'string' },
          },
        },
        metal: {
          type: 'object',
          required: ['metalCode'],
          properties: {
            metalCode: { type: 'string' },
            purityCode: { type: 'string' },
          },
        },
        stones: { type: 'array', items: { type: 'object' } },
        elements: { type: 'array', items: { type: 'object' } },
        finishCode: { type: 'string' },
        additionalStonesText: { type: 'string' },
        personalNote: { type: 'string' },
      },
      additionalProperties: true,
    },
    lockFields: ['metal'],
    defaults: { finishCode: 'POLISHED' },
  };
}

async function seedItemTypes(): Promise<Record<string, string>> {
  const seeds = [ringItemType(), necklaceItemType(), braceletItemType(), earringsItemType()];
  const ids: Record<string, string> = {};

  for (const seed of seeds) {
    const itemType = await prisma.itemType.upsert({
      where: { code: seed.code },
      update: { labelHe: seed.labelHe, labelEn: seed.labelEn, sortOrder: seed.sortOrder },
      create: {
        code: seed.code,
        labelHe: seed.labelHe,
        labelEn: seed.labelEn,
        sortOrder: seed.sortOrder,
      },
    });
    ids[seed.code] = itemType.id;

    await prisma.itemTypeConfig.upsert({
      where: { itemTypeId: itemType.id },
      update: {
        steps: seed.steps,
        parametersSchema: seed.parametersSchema,
        lockFields: seed.lockFields,
        defaults: seed.defaults,
      },
      create: {
        itemTypeId: itemType.id,
        steps: seed.steps,
        parametersSchema: seed.parametersSchema,
        lockFields: seed.lockFields,
        compatibilityRules: [],
        defaults: seed.defaults,
      },
    });
  }

  console.log(`Seed complete: ${seeds.length} item types with configs`);
  return ids;
}

async function seedMetalsAndPurities() {
  const metals: { code: string; labelHe: string; labelEn: string; sortOrder: number; purities: string[] }[] = [
    { code: 'SILVER', labelHe: 'כסף', labelEn: 'Silver', sortOrder: 1, purities: ['925'] },
    { code: 'YELLOW_GOLD', labelHe: 'זהב צהוב', labelEn: 'Yellow Gold', sortOrder: 2, purities: ['12K', '14K', '18K'] },
    { code: 'ROSE_GOLD', labelHe: 'זהב ורוד', labelEn: 'Rose Gold', sortOrder: 3, purities: ['12K', '14K', '18K'] },
    { code: 'WHITE_GOLD', labelHe: 'זהב לבן', labelEn: 'White Gold', sortOrder: 4, purities: ['12K', '14K', '18K'] },
    { code: 'PLATINUM', labelHe: 'פלטינה', labelEn: 'Platinum', sortOrder: 5, purities: ['950'] },
  ];

  for (const metal of metals) {
    const row = await prisma.metal.upsert({
      where: { code: metal.code },
      update: { labelHe: metal.labelHe, labelEn: metal.labelEn, sortOrder: metal.sortOrder },
      create: {
        code: metal.code,
        labelHe: metal.labelHe,
        labelEn: metal.labelEn,
        sortOrder: metal.sortOrder,
      },
    });

    for (const purityCode of metal.purities) {
      await prisma.metalPurity.upsert({
        where: { metalId_code: { metalId: row.id, code: purityCode } },
        update: {},
        create: { metalId: row.id, code: purityCode, labelHe: purityCode },
      });
    }
  }

  console.log(`Seed complete: ${metals.length} metals with purities`);
}

async function seedSettings(itemTypeIds: Record<string, string>) {
  const settings: { code: string; labelHe: string; labelEn: string; minBandWidthMm: number; sortOrder: number }[] = [
    { code: '4_PRONG', labelHe: 'משבצת 4 צבתות', labelEn: '4-Prong', minBandWidthMm: 1.5, sortOrder: 1 },
    { code: '6_PRONG', labelHe: 'משבצת 6 צבתות', labelEn: '6-Prong', minBandWidthMm: 1.8, sortOrder: 2 },
    { code: 'BEZEL', labelHe: 'משבצת סגורה', labelEn: 'Bezel', minBandWidthMm: 2.0, sortOrder: 3 },
    { code: 'PAVE', labelHe: 'פאבה', labelEn: 'Pavé', minBandWidthMm: 1.2, sortOrder: 4 },
  ];

  const typeIds = Object.values(itemTypeIds);

  for (const setting of settings) {
    const row = await prisma.setting.upsert({
      where: { code: setting.code },
      update: {
        labelHe: setting.labelHe,
        labelEn: setting.labelEn,
        minBandWidthMm: setting.minBandWidthMm,
        sortOrder: setting.sortOrder,
      },
      create: {
        code: setting.code,
        labelHe: setting.labelHe,
        labelEn: setting.labelEn,
        minBandWidthMm: setting.minBandWidthMm,
        sortOrder: setting.sortOrder,
      },
    });

    for (const itemTypeId of typeIds) {
      await prisma.settingItemType.upsert({
        where: { settingId_itemTypeId: { settingId: row.id, itemTypeId } },
        update: {},
        create: { settingId: row.id, itemTypeId },
      });
    }
  }

  console.log(`Seed complete: ${settings.length} settings`);
}

async function seedStonesAndElements() {
  const stones: Array<{
    code: string
    nameHe: string
    nameEn: string
    options: Array<{ kind: string; value: string; labelHe: string }>
  }> = [
    {
      code: 'DIAMOND',
      nameHe: 'יהלום',
      nameEn: 'Diamond',
      options: [
        { kind: 'SHAPE', value: 'ROUND', labelHe: 'עגול' },
        { kind: 'COLOR', value: 'D', labelHe: 'D' },
        { kind: 'SIZE_MM', value: '1.0', labelHe: '1.0' },
      ],
    },
    {
      code: 'SAPPHIRE',
      nameHe: 'ספיר',
      nameEn: 'Sapphire',
      options: [
        { kind: 'SHAPE', value: 'OVAL', labelHe: 'אובלי' },
        { kind: 'COLOR', value: 'BLUE', labelHe: 'כחול' },
        { kind: 'SIZE_MM', value: '2.0', labelHe: '2.0' },
      ],
    },
    {
      code: 'RUBY',
      nameHe: 'רובי',
      nameEn: 'Ruby',
      options: [
        { kind: 'SHAPE', value: 'ROUND', labelHe: 'עגול' },
        { kind: 'COLOR', value: 'RED', labelHe: 'אדום' },
        { kind: 'SIZE_MM', value: '1.5', labelHe: '1.5' },
      ],
    },
    {
      code: 'EMERALD',
      nameHe: 'ברקת',
      nameEn: 'Emerald',
      options: [
        { kind: 'SHAPE', value: 'EMERALD', labelHe: 'אמרלד' },
        { kind: 'COLOR', value: 'GREEN', labelHe: 'ירוק' },
        { kind: 'SIZE_MM', value: '2.0', labelHe: '2.0' },
      ],
    },
  ];

  for (const stone of stones) {
    const row = await prisma.stone.upsert({
      where: { code: stone.code },
      update: { nameHe: stone.nameHe, nameEn: stone.nameEn },
      create: { code: stone.code, nameHe: stone.nameHe, nameEn: stone.nameEn, sortOrder: stones.indexOf(stone) },
    });
    for (const option of stone.options) {
      await prisma.stoneOption.upsert({
        where: { stoneId_kind_value: { stoneId: row.id, kind: option.kind, value: option.value } },
        update: { labelHe: option.labelHe },
        create: {
          stoneId: row.id,
          kind: option.kind,
          value: option.value,
          labelHe: option.labelHe,
        },
      });
    }
  }

  const elements: Array<{ code: string; labelHe: string; labelEn: string }> = [
    { code: 'HEART', labelHe: 'לב', labelEn: 'Heart' },
    { code: 'STAR', labelHe: 'כוכב', labelEn: 'Star' },
    { code: 'LEAF', labelHe: 'עלה', labelEn: 'Leaf' },
    { code: 'INITIAL', labelHe: 'אות', labelEn: 'Initial' },
  ];
  for (const element of elements) {
    await prisma.elementCatalog.upsert({
      where: { code: element.code },
      update: { labelHe: element.labelHe, labelEn: element.labelEn },
      create: { code: element.code, labelHe: element.labelHe, labelEn: element.labelEn },
    });
  }

  console.log(`Seed complete: ${stones.length} stones, ${elements.length} elements`);
}

/**
 * The ring chart of the PRD (5.4): Israeli/European sizes 52–64 with their US sizes and inner
 * diameters. The PRD gives the diameter ranges of the two ends (US 6.00: 16.55–16.95 mm, US 10.75:
 * 20.40–20.44 mm); the sizes between them carry the diameter shown in the design (Figma).
 */
const RING_SIZES: { il: string; us: string; minMm: number; maxMm: number }[] = [
  { il: '52', us: '6.00', minMm: 16.55, maxMm: 16.95 },
  { il: '54', us: '7.00', minMm: 17.19, maxMm: 17.19 },
  { il: '56', us: '7.75', minMm: 17.83, maxMm: 17.83 },
  { il: '58', us: '8.50', minMm: 18.47, maxMm: 18.47 },
  { il: '60', us: '9.25', minMm: 19.1, maxMm: 19.1 },
  { il: '62', us: '10.00', minMm: 19.76, maxMm: 19.76 },
  { il: '64', us: '10.75', minMm: 20.4, maxMm: 20.44 },
];

/** The measuring guide's table as first seeded; a re-seed replaces only this, never an edited guide. */
const LEGACY_RING_GUIDE_TABLE = [
  { standard: 'US', sizeCode: '5.00', diameterMm: 15.7 },
  { standard: 'US', sizeCode: '6.00', diameterMm: 16.5 },
  { standard: 'US', sizeCode: '7.00', diameterMm: 17.3 },
  { standard: 'US', sizeCode: '8.00', diameterMm: 18.1 },
  { standard: 'US', sizeCode: '9.00', diameterMm: 18.9 },
];

async function seedSizeCharts(itemTypeIds: Record<string, string>) {
  const ringId = itemTypeIds.RING;
  if (!ringId) {
    return;
  }

  const rows = RING_SIZES.flatMap((size, i) => [
    { standard: 'IL', sizeCode: size.il, diameterMinMm: size.minMm, diameterMaxMm: size.maxMm, sortOrder: i },
    { standard: 'US', sizeCode: size.us, diameterMinMm: size.minMm, diameterMaxMm: size.maxMm, sortOrder: i },
  ]);
  for (const row of rows) {
    await prisma.sizeChart.upsert({
      where: { itemTypeId_standard_sizeCode: { itemTypeId: ringId, standard: row.standard, sizeCode: row.sizeCode } },
      update: { diameterMinMm: row.diameterMinMm, diameterMaxMm: row.diameterMaxMm, sortOrder: row.sortOrder, isActive: true },
      create: { itemTypeId: ringId, ...row },
    });
  }
  // Sizes an earlier chart offered (US 5.00 / 8.00 / 9.00) are retired, not deleted: designs keep them.
  for (const standard of ['IL', 'US']) {
    await prisma.sizeChart.updateMany({
      where: {
        itemTypeId: ringId,
        standard,
        isActive: true,
        sizeCode: { notIn: rows.filter((row) => row.standard === standard).map((row) => row.sizeCode) },
      },
      data: { isActive: false },
    });
  }

  console.log(`Seed complete: ${rows.length} RING size chart rows (IL and US)`);
}

async function seedMeasurementGuides(itemTypeIds: Record<string, string>) {
  const ringId = itemTypeIds.RING;
  if (!ringId) {
    return;
  }

  const tips = [
    'מדדו את האצבע בסוף היום כשהיא בגודלה המקסימלי.',
    'השתמשו בטבעת קיימת שמתאימה כדי להשוות קוטר.',
  ];
  // Same row shape as before (the app reads standard / sizeCode / diameterMm), plus the US size.
  const table = RING_SIZES.map((size) => ({
    standard: 'IL',
    sizeCode: size.il,
    us: size.us,
    diameterMm: size.minMm === size.maxMm ? size.minMm.toFixed(2) : `${size.minMm.toFixed(2)}–${size.maxMm.toFixed(2)}`,
  }));
  const existing = await prisma.measurementGuide.findUnique({
    where: { itemTypeId_locale: { itemTypeId: ringId, locale: 'he' } },
  });
  if (!existing) {
    await prisma.measurementGuide.create({
      data: { itemTypeId: ringId, locale: 'he', title: 'איך למדוד מידת טבעת', body: { tips, table } },
    });
  } else if (JSON.stringify((existing.body as { table?: unknown } | null)?.table) === JSON.stringify(LEGACY_RING_GUIDE_TABLE)) {
    await prisma.measurementGuide.update({
      where: { id: existing.id },
      data: { body: { ...(existing.body as Record<string, unknown>), table } },
    });
  }

  console.log('Seed complete: RING measurement guide (he)');
}

const FEATURE_FLAGS = [
  'phase2_visualization',
  'phase2_promotion_ranker',
  'phase2_matching',
  'phase3_oauth',
  'phase3_postgis',
  'phase3_jewelry_pay',
];

/** Flags start disabled and are never flipped by a re-seed: turning a feature on is an operator decision. */
async function seedFeatureFlags() {
  const created = await prisma.featureFlag.createMany({
    data: FEATURE_FLAGS.map((key) => ({ key, enabled: false, rolloutPct: 100 })),
    skipDuplicates: true,
  });
  console.log(`Seed complete: ${created.count} feature flags added (disabled)`);
}

/** Local development: every phase 2/3 feature on. */
async function enableDemoFeatureFlags() {
  await prisma.featureFlag.updateMany({ where: { key: { in: FEATURE_FLAGS } }, data: { enabled: true, rolloutPct: 100 } });
  console.log('Seed complete: demo feature flags enabled');
}

async function seedEntitlementDefinitions(): Promise<Record<string, string>> {
  const entitlements: { key: string; description: string }[] = [
    { key: 'no_watermark', description: 'Export renders without the platform watermark' },
    { key: 'hd_export', description: 'High-resolution PNG / production-file exports' },
    { key: 'personal_visualization', description: 'Try-on visualization from a personal photo' },
    { key: 'warm_leads', description: 'Receive targeted, ready-to-quote design requests' },
    { key: 'verified_designer_badge', description: 'Verified badge shown on designer-authored designs' },
    { key: 'priority_cloud_processing', description: 'Lower queue priority number for render/AI jobs' },
    { key: 'priority_routing', description: 'Jeweler profile surfaces higher in matching/routing' },
    { key: 'jeweler_crm', description: 'Access to the internal production-tracking CRM notes' },
    { key: 'ai_renders', description: 'AI creations (inspiration pictures) per billing period; limitValue is the cap' },
  ];

  const ids: Record<string, string> = {};
  for (const entitlement of entitlements) {
    const row = await prisma.entitlementDefinition.upsert({
      where: { key: entitlement.key },
      update: { description: entitlement.description },
      create: entitlement,
    });
    ids[entitlement.key] = row.id;
  }

  console.log(`Seed complete: ${entitlements.length} entitlement definitions`);
  return ids;
}

async function seedPlanCatalog(entitlementIds: Record<string, string>) {
  type PlanSeed = {
    code: string;
    role: UserRole;
    nameHe: string;
    nameEn: string;
    billingCycle: BillingCycle;
    price: number;
    leadQuota: number;
    extraLeadPrice?: number;
    trialDays: number;
    sortOrder: number;
    /** What the plan includes, in Hebrew (the app's language) with the English beside it. */
    inclusions: { bullets: string[]; bulletsEn: string[] };
    /** The English-only list seeded before: a re-seed replaces it (an operator's own list is kept). */
    legacyInclusions?: Prisma.InputJsonValue;
    /** Display hints: `unlimited` plans show "unlimited (fair use)" instead of their caps. */
    metadata?: Prisma.InputJsonValue;
    /** Entitlement key → its cap (`ai_renders`: AI creations per billing period), or null. */
    entitlements: Record<string, number | null>;
  };

  const DESIGNER_PREMIUM = { no_watermark: null, hd_export: null, personal_visualization: null, verified_designer_badge: null };
  const JEWELER_PAID = { warm_leads: null, priority_routing: null, jeweler_crm: null, priority_cloud_processing: null };
  const LISTING = { bullets: ['הצגה ברשימת הצורפים באטלייה'], bulletsEn: ['Standard profile listing'] };

  // The client's pricing table of 19.10 (prices in ILS). "Unlimited" plans are capped for fair use:
  // 1,200 AI creations a year, 40 leads a quarter. No plan sells extra leads: when a jeweler's
  // leads for the quarter are used, requests stop until the next quarter. Paid plans keep the
  // 14-day trial the catalog had before.
  const plans: PlanSeed[] = [
    {
      code: 'DESIGNER_FREE',
      role: UserRole.DESIGNER,
      nameHe: 'מעצב/ת - חינם',
      nameEn: 'Designer Free',
      billingCycle: BillingCycle.MONTHLY,
      price: 0,
      leadQuota: 0,
      trialDays: 0,
      sortOrder: 1,
      inclusions: {
        bullets: ['עיצובי טיוטה ללא הגבלה', 'ייצוא רגיל עם סימן מים'],
        bulletsEn: ['Unlimited draft designs', 'Standard export with watermark'],
      },
      legacyInclusions: { bullets: ['Unlimited draft designs', 'Standard export with watermark'] },
      entitlements: { ai_renders: 10 },
    },
    {
      code: 'DESIGNER_PREMIUM_QUARTERLY',
      role: UserRole.DESIGNER,
      nameHe: 'מעצב/ת - פרימיום רבעוני',
      nameEn: 'Designer Premium Quarterly',
      billingCycle: BillingCycle.QUARTERLY,
      price: 45,
      leadQuota: 0,
      trialDays: 14,
      sortOrder: 2,
      inclusions: { bullets: ['כל יכולות הפרימיום, בחיוב רבעוני'], bulletsEn: ['All premium features, billed quarterly'] },
      entitlements: { ...DESIGNER_PREMIUM, ai_renders: 150 },
    },
    {
      code: 'DESIGNER_PREMIUM_ANNUAL',
      role: UserRole.DESIGNER,
      nameHe: 'מעצב/ת - פרימיום שנתי',
      nameEn: 'Designer Premium Annual',
      billingCycle: BillingCycle.ANNUAL,
      price: 149,
      leadQuota: 0,
      trialDays: 14,
      sortOrder: 3,
      inclusions: { bullets: ['כל יכולות הפרימיום, בחיוב שנתי'], bulletsEn: ['All premium features, billed yearly'] },
      entitlements: { ...DESIGNER_PREMIUM, ai_renders: 600 },
    },
    {
      code: 'DESIGNER_PREMIUM_UNLIMITED',
      role: UserRole.DESIGNER,
      nameHe: 'מעצב/ת - פרימיום ללא הגבלה',
      nameEn: 'Designer Premium Unlimited',
      billingCycle: BillingCycle.ANNUAL,
      price: 299,
      leadQuota: 0,
      trialDays: 14,
      sortOrder: 4,
      inclusions: { bullets: ['בכפוף למדיניות שימוש הוגן'], bulletsEn: ['Subject to the fair use policy'] },
      metadata: { unlimited: true },
      entitlements: { ...DESIGNER_PREMIUM, ai_renders: 1200 },
    },
    {
      code: 'JEWELER_TRIAL',
      role: UserRole.JEWELER,
      nameHe: 'צורף/ת - התנסות',
      nameEn: 'Jeweler Trial',
      billingCycle: BillingCycle.QUARTERLY,
      price: 0,
      leadQuota: 3,
      trialDays: 0,
      sortOrder: 1,
      inclusions: LISTING,
      entitlements: {},
    },
    {
      code: 'JEWELER_BASIC_QUARTERLY',
      role: UserRole.JEWELER,
      nameHe: 'צורף/ת - בסיסית',
      nameEn: 'Jeweler Basic',
      billingCycle: BillingCycle.QUARTERLY,
      price: 390,
      leadQuota: 10,
      trialDays: 14,
      sortOrder: 2,
      inclusions: LISTING,
      entitlements: JEWELER_PAID,
    },
    {
      code: 'JEWELER_PROFESSIONAL',
      role: UserRole.JEWELER,
      nameHe: 'צורף/ת - מקצועית',
      nameEn: 'Jeweler Professional',
      billingCycle: BillingCycle.QUARTERLY,
      price: 525,
      leadQuota: 15,
      trialDays: 14,
      sortOrder: 3,
      inclusions: LISTING,
      entitlements: JEWELER_PAID,
    },
    {
      code: 'JEWELER_BUSINESS',
      role: UserRole.JEWELER,
      nameHe: 'צורף/ת - עסקית',
      nameEn: 'Jeweler Business',
      billingCycle: BillingCycle.QUARTERLY,
      price: 640,
      leadQuota: 20,
      trialDays: 14,
      sortOrder: 4,
      inclusions: LISTING,
      entitlements: JEWELER_PAID,
    },
    {
      code: 'JEWELER_UNLIMITED',
      role: UserRole.JEWELER,
      nameHe: 'צורף/ת - ללא הגבלה',
      nameEn: 'Jeweler Unlimited',
      billingCycle: BillingCycle.QUARTERLY,
      price: 990,
      leadQuota: 40,
      trialDays: 14,
      sortOrder: 5,
      inclusions: {
        bullets: ['הצגה ברשימת הצורפים באטלייה', 'בכפוף למדיניות שימוש הוגן'],
        bulletsEn: ['Standard profile listing', 'Subject to the fair use policy'],
      },
      metadata: { unlimited: true },
      entitlements: JEWELER_PAID,
    },
  ];

  for (const plan of plans) {
    // Prices, quotas and trials are business settings: created once, never overwritten here.
    const row = await prisma.planCatalog.upsert({
      where: { code: plan.code },
      update: {},
      create: {
        code: plan.code,
        role: plan.role,
        nameHe: plan.nameHe,
        nameEn: plan.nameEn,
        billingCycle: plan.billingCycle,
        price: plan.price,
        currency: 'ILS',
        leadQuota: plan.leadQuota,
        extraLeadPrice: plan.extraLeadPrice,
        trialDays: plan.trialDays,
        sortOrder: plan.sortOrder,
        inclusions: plan.inclusions,
        metadata: plan.metadata,
      },
    });
    // The feature texts of a plan seeded before were English only: those are replaced; a list an
    // operator rewrote is not.
    if (plan.legacyInclusions && JSON.stringify(row.inclusions) === JSON.stringify(plan.legacyInclusions)) {
      await prisma.planCatalog.update({ where: { id: row.id }, data: { inclusions: plan.inclusions } });
    }

    for (const [key, limitValue] of Object.entries(plan.entitlements)) {
      const entitlementId = entitlementIds[key];
      if (!entitlementId) {
        continue;
      }
      // A cap an operator changed is theirs: only a missing link is created.
      await prisma.planEntitlement.upsert({
        where: { planId_entitlementId: { planId: row.id, entitlementId } },
        update: {},
        create: { planId: row.id, entitlementId, limitValue },
      });
    }
  }

  console.log(`Seed complete: ${plans.length} plan catalog rows`);
}

/** Local designer can hit try-on (`personal_visualization`) without buying a plan. */
async function seedDesignerPremiumTrial() {
  const designer = await prisma.user.findUnique({ where: { email: 'designer@dev.mailnvosky.local' } });
  const plan = await prisma.planCatalog.findUnique({ where: { code: 'DESIGNER_PREMIUM_QUARTERLY' } });
  if (!designer || !plan) {
    console.log('Seed skip: designer premium trial (user or plan missing)');
    return;
  }

  // One live subscription per user (enforced by a unique index): any live plan means skip.
  const existing = await prisma.subscription.findFirst({
    where: {
      userId: designer.id,
      status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
    },
  });
  if (existing) {
    console.log('Seed skip: designer already has a live subscription');
    return;
  }

  const now = new Date();
  const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await prisma.subscription.create({
    data: {
      userId: designer.id,
      planId: plan.id,
      role: UserRole.DESIGNER,
      status: SubscriptionStatus.TRIALING,
      billingCycle: plan.billingCycle,
      price: plan.price,
      currency: plan.currency,
      trialEndsAt: trialEnds,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnds,
    },
  });
  console.log('Seed complete: designer DESIGNER_PRO trial');
}

/**
 * Showcase seed for Page 1 (BusinessProfileView).
 * Mirrors the app's Hebrew demo copy so the integrated UI looks identical:
 * businessName / bio / 2 portfolio works / 2 featured reviews.
 * Idempotent: safe to re-run.
 */
async function seedJewelerProfileShowcase() {
  const jeweler = await prisma.user.findUnique({ where: { email: 'jeweler@dev.mailnvosky.local' } });
  if (!jeweler) {
    console.log('Seed skip: jeweler dev user missing');
    return;
  }
  const region = await prisma.region.findUnique({ where: { code: 'TEL_AVIV' } });
  if (!region) {
    console.log('Seed skip: TEL_AVIV region missing');
    return;
  }

  const profile = await prisma.jewelerProfile.upsert({
    where: { userId: jeweler.id },
    update: {
      businessName: 'תכשיטי גורלי',
      bio: 'אטלייה "נילדד פארצ\'מנט" מתמחה בצורפות עלית בעבודת יד. אנו משלבים טכניקות מסורתיות עם עיצוב מודרני ליצירת תכשיטים שהם יצירות אמנות נצחיות. כל אבן נבחרת בקפידה ובכל עיצוב יש סיפור ייחודי של יוקרה ודיוק.',
      regionId: region.id,
      phone: '+972501234567',
      email: 'jeweler@dev.mailnvosky.local',
      publishStatus: ProfilePublishStatus.PUBLISHED,
      publishedAt: new Date(),
      verifiedBadge: true,
      verifiedAt: new Date(),
      latitude: 32.0853,
      longitude: 34.7818,
      specialties: ['ENGAGEMENT_RINGS', 'CUSTOM'],
    },
    create: {
      userId: jeweler.id,
      businessName: 'תכשיטי גורלי',
      bio: 'אטלייה "נילדד פארצ\'מנט" מתמחה בצורפות עלית בעבודת יד. אנו משלבים טכניקות מסורתיות עם עיצוב מודרני ליצירת תכשיטים שהם יצירות אמנות נצחיות. כל אבן נבחרת בקפידה ובכל עיצוב יש סיפור ייחודי של יוקרה ודיוק.',
      regionId: region.id,
      phone: '+972501234567',
      email: 'jeweler@dev.mailnvosky.local',
      publishStatus: ProfilePublishStatus.PUBLISHED,
      publishedAt: new Date(),
      verifiedBadge: true,
      verifiedAt: new Date(),
      latitude: 32.0853,
      longitude: 34.7818,
      specialties: ['ENGAGEMENT_RINGS', 'CUSTOM'],
    },
  });

  // Portfolio uploads reference real bytes under backend/seed-assets/showcase,
  // served by GET /uploads/:id/content — the app loads gallery art over HTTP.
  await prisma.portfolioItem.deleteMany({ where: { profileId: profile.id } });
  await prisma.upload.deleteMany({
    where: { ownerUserId: jeweler.id, objectKey: { startsWith: 'seed/' } },
  });
  // Portfolio order mirrors the app's gallery order (flower first, ring second).
  const works = [
    { title: 'עגילי פרח', file: 'work-flower.png', sizeBytes: 204814 },
    { title: 'טבעת אוקיינוס', file: 'work-ring.png', sizeBytes: 287849 },
  ];
  for (let i = 0; i < works.length; i += 1) {
    const upload = await prisma.upload.create({
      data: {
        ownerUserId: jeweler.id,
        bucket: 'local-dev',
        objectKey: `seed/showcase/${works[i].file}`,
        mimeType: 'image/png',
        sizeBytes: works[i].sizeBytes,
        status: 'READY',
      },
    });
    await prisma.portfolioItem.create({
      data: {
        profileId: profile.id,
        uploadId: upload.id,
        title: works[i].title,
        sortOrder: i,
        isSelectedWork: true,
      },
    });
  }

  await prisma.review.deleteMany({ where: { jewelerProfileId: profile.id } });
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const reviews = [
    {
      reviewerName: 'מיכל כהן',
      rating: 5,
      comment: 'העבודה מדויקת, השירות אדיב, והתוצאה עלתה על כל הציפיות. ממליצה בחום!',
      isFeatured: true,
      createdAt: new Date(now - 2 * dayMs),
    },
    {
      reviewerName: 'נועה לוי',
      rating: 5,
      comment: 'תהליך מקצועי מההתחלה ועד הסוף. התכשיט יצא מושלם בדיוק כמו שחלמתי.',
      isFeatured: true,
      createdAt: new Date(now - 7 * dayMs),
    },
  ];
  for (const review of reviews) {
    await prisma.review.create({ data: { jewelerProfileId: profile.id, ...review } });
  }
  await prisma.jewelerProfile.update({
    where: { id: profile.id },
    data: { ratingAvg: 5, reviewCount: reviews.length },
  });

  console.log('Seed complete: jeweler showcase profile (תכשיטי גורלי, 2 works, 2 reviews)');
}

/**
 * The chat messages posted when a quote is accepted (PRD 5.6). An operator may reword them: a
 * re-seed only replaces the original English text, never an edited one.
 */
async function seedSystemMessageTemplates() {
  const templates: { eventKey: string; locale: string; body: string; legacyBody: string }[] = [
    {
      eventKey: 'quote.accepted',
      locale: 'he',
      body: 'ההצעה אושרה בהצלחה! כדי להשלים את התהליך אפשר עכשיו לתאם ישירות עם {{jewelerName}}.',
      legacyBody: 'The quote from {{jewelerName}} was accepted.',
    },
    {
      eventKey: 'handoff.created',
      locale: 'he',
      body: 'הנה קישור להמשך התקשרות ישירה עם {{jewelerName}}: {{whatsappUrl}}',
      legacyBody: 'Continue the handoff with {{jewelerName}} on WhatsApp: {{whatsappUrl}}',
    },
  ];

  for (const { legacyBody, ...template } of templates) {
    await prisma.systemMessageTemplate.upsert({
      where: { eventKey_locale: { eventKey: template.eventKey, locale: template.locale } },
      update: {},
      create: template,
    });
    await prisma.systemMessageTemplate.updateMany({
      where: { eventKey: template.eventKey, locale: template.locale, body: legacyBody },
      data: { body: template.body },
    });
  }

  console.log(`Seed complete: ${templates.length} system message templates`);
}

async function seedContentPages() {
  const now = new Date();
  const existing = await prisma.contentPage.findFirst({
    where: { slug: 'quote_disclaimer', locale: 'he' },
    orderBy: { version: 'desc' },
  });

  if (existing) {
    if (existing.status !== ContentPageStatus.PUBLISHED) {
      await prisma.contentPage.update({
        where: { id: existing.id },
        data: { status: ContentPageStatus.PUBLISHED, publishedAt: existing.publishedAt ?? now },
      });
    }
  } else {
    await prisma.contentPage.create({
      data: {
        slug: 'quote_disclaimer',
        locale: 'he',
        title: 'תנאי הצעת מחיר',
        body: {
          blocks: [
            {
              type: 'paragraph',
              text: 'הצעת המחיר היא הערכה ראשונית בלבד ואינה מהווה התחייבות סופית של הצורף/ת. המחיר הסופי עשוי להשתנות בהתאם לזמינות חומרים, מורכבות הביצוע ותיאום ישיר מול הצורף/ת.',
            },
          ],
        },
        status: ContentPageStatus.PUBLISHED,
        publishedAt: now,
      },
    });
  }

  console.log('Seed complete: quote_disclaimer content page (he, published)');
}

/**
 * Showcase seed for Chats (jeweler perspective).
 * Mirrors the app's 5 demo rows: peer names, design titles, preview texts,
 * times (today 14:23–16:00) and unread badges 1–5. Conversation 1 reuses the
 * thread demo exchange so ChatThread looks familiar. Idempotent.
 */
async function seedJewelerChatShowcase(itemTypeIds: Record<string, string>) {
  const jeweler = await prisma.user.findUnique({ where: { email: 'jeweler@dev.mailnvosky.local' } });
  if (!jeweler) {
    console.log('Seed skip: jeweler dev user missing');
    return;
  }

  const peers = [
    {
      email: 'yossi@dev.mailnvosky.local', firstName: 'יוסי', lastName: 'ברק',
      designTitle: 'טבעת פנינה', itemType: 'RING', lastTime: '14:23', unread: 1,
      preview: 'אוכל להתחיל בעבודה תוך כשבועיים מרגע אישור...',
      history: [
        { fromPeer: true, body: 'שלום, צירפתי לך את הצעת המחיר המעודכנת עבור הטבעת שביקשת. האם תרצה לבצע שינויים כלשהם בסוג האבן?', at: '14:05' },
        { fromPeer: false, body: 'נראה מצוין, תודה! האם ניתן להשתמש בזהב לבן במקום בצהוב באותו המחיר?', at: '14:12' },
        { fromPeer: true, body: 'בוודאי, אין הבדל במחיר בין זהב צהוב לזהב לבן 14K. אני יכול לעדכן את ההזמנה עבורך.', at: '14:18' },
      ],
    },
    {
      email: 'maya@dev.mailnvosky.local', firstName: 'מיה', lastName: 'לוי',
      designTitle: 'שרשרת זהב', itemType: 'NECKLACE', lastTime: '14:45', unread: 2,
      preview: 'שלחתי עדכון לגבי מידות החישוק',
      history: [
        { fromPeer: false, body: 'השרשרת בתהליך, אעדכן כשיהיה חדש', at: '13:50' },
        { fromPeer: true, body: 'תודה! מחכה לעדכון', at: '14:00' },
      ],
    },
    {
      email: 'omer@dev.mailnvosky.local', firstName: 'עומר', lastName: 'שמואלי',
      designTitle: 'עגילים מכסף', itemType: 'EARRINGS', lastTime: '15:10', unread: 3,
      preview: 'אפשר לתאם שיחה קצרה מחר בבוקר?',
      history: [
        { fromPeer: false, body: 'העגילים כמעט מוכנים לליטוש סופי', at: '14:20' },
        { fromPeer: true, body: 'נהדר, אשמח לראות תמונה', at: '14:30' },
      ],
    },
    {
      email: 'ronit@dev.mailnvosky.local', firstName: 'רונית', lastName: 'כהן',
      designTitle: 'צמיד טורקיז', itemType: 'BRACELET', lastTime: '15:30', unread: 4,
      preview: 'העיצוב מוכן לסקירה סופית',
      history: [
        { fromPeer: false, body: 'סיימתי את שיבוץ האבנים בצמיד', at: '14:35' },
        { fromPeer: true, body: 'איזה כיף לשמוע!', at: '14:40' },
      ],
    },
    {
      email: 'eitan@dev.mailnvosky.local', firstName: 'איתן', lastName: 'גולדמן',
      designTitle: 'מחרוזת פנינים', itemType: 'NECKLACE', lastTime: '16:00', unread: 5,
      preview: 'הצעת המחיר עודכנה לפי הבקשה שלך',
      history: [
        { fromPeer: false, body: 'שלחתי לך את הצעת המחיר הראשונית', at: '15:00' },
        { fromPeer: true, body: 'קיבלתי, אבדוק ואחזור אליך', at: '15:05' },
      ],
    },
  ];

  const peerPasswordHash = await bcrypt.hash('Designer123!', 12);
  const atToday = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };
  const metalParams = (withSize: boolean) => ({
    ...(withSize ? { size: { standard: 'US', sizeCode: '7.00' } } : {}),
    metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
  });

  for (const peer of peers) {
    const peerUser = await prisma.user.upsert({
      where: { email: peer.email },
      update: { firstName: peer.firstName, lastName: peer.lastName },
      create: {
        email: peer.email,
        passwordHash: peerPasswordHash,
        firstName: peer.firstName,
        lastName: peer.lastName,
        roles: [UserRole.DESIGNER],
        activeRole: UserRole.DESIGNER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    let design = await prisma.design.findFirst({
      where: { ownerUserId: peerUser.id, title: peer.designTitle, deletedAt: null },
    });
    if (!design) {
      design = await prisma.design.create({
        data: {
          ownerUserId: peerUser.id,
          itemTypeId: itemTypeIds[peer.itemType],
          title: peer.designTitle,
          status: 'PUBLISHED',
          parameters: metalParams(peer.itemType === 'RING'),
        },
      });
    }

    // Fresh conversation each seed (cascade clears old messages/participants).
    await prisma.conversation.deleteMany({ where: { designId: design.id } });
    const conversation = await prisma.conversation.create({
      data: {
        designId: design.id,
        participants: { create: [{ userId: peerUser.id }, { userId: jeweler.id }] },
      },
    });

    const lastAt = atToday(peer.lastTime);
    // History, then jeweler reads, then `unread` peer messages ending at lastTime.
    for (const msg of peer.history) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: msg.fromPeer ? peerUser.id : jeweler.id,
          type: 'TEXT',
          body: msg.body,
          createdAt: atToday(msg.at),
        },
      });
    }
    const readAt = new Date(lastAt.getTime() - peer.unread * 60_000 - 30_000);
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: conversation.id, userId: jeweler.id },
      data: { lastReadAt: readAt },
    });
    // Showcase media inside the read history (first conversation only): a
    // workshop photo + voice note, so the thread renders IMAGE/AUDIO bubbles.
    if (peer.email === 'yossi@dev.mailnvosky.local') {
      await prisma.upload.deleteMany({
        where: { ownerUserId: peerUser.id, objectKey: { startsWith: 'seed/showcase/' } },
      });
      const photo = await prisma.upload.create({
        data: {
          ownerUserId: peerUser.id,
          bucket: 'local-dev',
          objectKey: 'seed/showcase/chat-ring.png',
          mimeType: 'image/png',
          sizeBytes: 287849,
          status: 'READY',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: peerUser.id,
          type: 'IMAGE',
          imageUploadId: photo.id,
          createdAt: new Date(lastAt.getTime() - 4 * 60_000),
        },
      });
      const voice = await prisma.upload.create({
        data: {
          ownerUserId: peerUser.id,
          bucket: 'local-dev',
          objectKey: 'seed/showcase/voice-note.wav',
          mimeType: 'audio/wav',
          sizeBytes: 48044,
          status: 'READY',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: peerUser.id,
          type: 'AUDIO',
          imageUploadId: voice.id,
          createdAt: new Date(lastAt.getTime() - 3 * 60_000),
        },
      });
    }
    const nudges = [
      'היי, רציתי לוודא שראית את ההודעה הקודמת',
      'אשמח לעדכון כשיתאפשר לך',
      'תודה רבה על העזרה!',
      'מחכה לשמוע ממך בהקדם',
    ];
    const tails = [...Array(peer.unread - 1).fill(null).map((_, i) => nudges[i % nudges.length]), peer.preview];
    for (let i = 0; i < tails.length; i += 1) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: peerUser.id,
          type: 'TEXT',
          body: tails[i],
          createdAt: new Date(lastAt.getTime() - (tails.length - 1 - i) * 60_000),
        },
      });
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: lastAt },
    });
  }

  console.log('Seed complete: 5 jeweler showcase conversations (chats)');
}

async function seedAtelierPromotions() {
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const bannerEntityId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1';

  await prisma.promotion.upsert({
    where: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee0' },
    update: {
      isActive: true,
      startAt: new Date(now.getTime() - 60_000),
      endAt: end,
      meta: { headline: 'Featured Atelier jewelers this week', cta: 'Browse' },
    },
    create: {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee0',
      entityType: PromotionEntityType.BANNER,
      entityId: bannerEntityId,
      placement: 'atelier_banner',
      source: PromotionSource.PAID_PLACEMENT,
      priority: 100,
      startAt: new Date(now.getTime() - 60_000),
      endAt: end,
      isActive: true,
      meta: { headline: 'Featured Atelier jewelers this week', cta: 'Browse' },
    },
  });

  const published =
    (await prisma.design.findFirst({
      where: { status: DesignStatus.PUBLISHED, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await prisma.design.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } }));
  if (published) {
    if (published.status !== DesignStatus.PUBLISHED) {
      await prisma.design.update({
        where: { id: published.id },
        data: { status: DesignStatus.PUBLISHED, publishedAt: now },
      });
    }
    await prisma.promotion.upsert({
      where: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2' },
      update: {
        entityId: published.id,
        isActive: true,
        startAt: new Date(now.getTime() - 60_000),
        endAt: end,
      },
      create: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2',
        entityType: PromotionEntityType.DESIGN,
        entityId: published.id,
        placement: 'atelier_designs_feed',
        source: PromotionSource.PAID_PLACEMENT,
        priority: 80,
        startAt: new Date(now.getTime() - 60_000),
        endAt: end,
        isActive: true,
        meta: { headline: 'Sponsored design' },
      },
    });
  }

  console.log('Seed complete: Atelier banner (+ design promotion if a published design exists)');
}

async function main() {
  if (SEED_DEMO_DATA && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data (accounts with published passwords) in production');
  }

  await seedRegions();
  const itemTypeIds = await seedItemTypes();
  await seedMetalsAndPurities();
  await seedSettings(itemTypeIds);
  await seedStonesAndElements();
  await seedSizeCharts(itemTypeIds);
  await seedMeasurementGuides(itemTypeIds);
  await seedFeatureFlags();
  const entitlementIds = await seedEntitlementDefinitions();
  await seedPlanCatalog(entitlementIds);
  await seedSystemMessageTemplates();
  await seedContentPages();
  await seedAppConfigDefaults();

  if (!SEED_DEMO_DATA) {
    console.log('Demo data skipped (set SEED_DEMO_DATA=true for local development)');
    return;
  }
  await seedUsers();
  await enableDemoFeatureFlags();
  await seedDesignerPremiumTrial();
  await seedJewelerProfileShowcase();
  await seedJewelerChatShowcase(itemTypeIds);
  await seedAtelierPromotions();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
