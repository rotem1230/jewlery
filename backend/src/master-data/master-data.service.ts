import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { PrismaService } from '../database/prisma.service';
import {
  CreateElementDto,
  CreateFinishTypeDto,
  CreateItemTypeDto,
  CreateMeasurementGuideDto,
  CreateMetalDto,
  CreateMetalPurityDto,
  CreateRegionDto,
  CreateSettingDto,
  CreateSizeChartDto,
  CreateStoneDto,
  CreateStoneOptionDto,
  UpdateElementDto,
  UpdateFinishTypeDto,
  UpdateItemTypeDto,
  UpdateMeasurementGuideDto,
  UpdateMetalDto,
  UpdateMetalPurityDto,
  UpdateRegionDto,
  UpdateSettingDto,
  UpdateSizeChartDto,
  UpdateStoneDto,
  UpdateStoneOptionDto,
} from './dto/master-data.dto';

export type EtlReport = {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
};

const ETL_ENTITIES = [
  'itemTypes',
  'metals',
  'settings',
  'stones',
  'finishTypes',
  'elements',
  'regions',
] as const;
type EtlEntity = (typeof ETL_ENTITIES)[number];

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Public reads
  // ---------------------------------------------------------------------

  itemTypes() {
    return this.prisma.itemType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  metals() {
    return this.prisma.metal.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { purities: { where: { isActive: true } } },
    });
  }

  settings() {
    return this.prisma.setting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { itemTypes: { include: { itemType: true } } },
    });
  }

  stones() {
    return this.prisma.stone.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  finishTypes() {
    return this.prisma.finishType.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  }

  elements() {
    return this.prisma.elementCatalog.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  }

  regions() {
    return this.prisma.region.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  sizeCharts(itemTypeId?: string, standard?: string) {
    return this.prisma.sizeChart.findMany({
      where: {
        isActive: true,
        itemTypeId,
        standard,
      },
      orderBy: [{ standard: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async measurementGuide(itemTypeId: string, locale = 'he') {
    const guide = await this.prisma.measurementGuide.findUnique({
      where: { itemTypeId_locale: { itemTypeId, locale } },
    });
    if (!guide) {
      throw new NotFoundException({
        success: false,
        message: `No measurement guide for item type "${itemTypeId}" locale "${locale}"`,
      });
    }
    return guide;
  }

  // ---------------------------------------------------------------------
  // Admin: ItemType
  // ---------------------------------------------------------------------

  adminListItemTypes() {
    return this.prisma.itemType.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async adminCreateItemType(dto: CreateItemTypeDto, actorUserId?: string) {
    const row = await this.prisma.itemType.create({ data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.item_type.create',
      entityType: 'ItemType',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateItemType(id: string, dto: UpdateItemTypeDto, actorUserId?: string) {
    const existing = await this.prisma.itemType.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.itemType.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.item_type.update',
      entityType: 'ItemType',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: Metal + MetalPurity
  // ---------------------------------------------------------------------

  adminListMetals() {
    return this.prisma.metal.findMany({ orderBy: { sortOrder: 'asc' }, include: { purities: true } });
  }

  async adminCreateMetal(dto: CreateMetalDto, actorUserId?: string) {
    const row = await this.prisma.metal.create({ data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.metal.create',
      entityType: 'Metal',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateMetal(id: string, dto: UpdateMetalDto, actorUserId?: string) {
    const existing = await this.prisma.metal.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.metal.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.metal.update',
      entityType: 'Metal',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  async adminCreateMetalPurity(metalId: string, dto: CreateMetalPurityDto, actorUserId?: string) {
    await this.prisma.metal.findUniqueOrThrow({ where: { id: metalId } });
    const row = await this.prisma.metalPurity.create({ data: { ...dto, metalId } });
    await this.audit.log({
      actorUserId,
      action: 'master_data.metal_purity.create',
      entityType: 'MetalPurity',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateMetalPurity(id: string, dto: UpdateMetalPurityDto, actorUserId?: string) {
    const existing = await this.prisma.metalPurity.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.metalPurity.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.metal_purity.update',
      entityType: 'MetalPurity',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: Setting
  // ---------------------------------------------------------------------

  adminListSettings() {
    return this.prisma.setting.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { itemTypes: true },
    });
  }

  async adminCreateSetting(dto: CreateSettingDto, actorUserId?: string) {
    const { itemTypeIds, ...data } = dto;
    const row = await this.prisma.setting.create({
      data: {
        ...data,
        itemTypes: itemTypeIds
          ? { create: itemTypeIds.map((itemTypeId) => ({ itemTypeId })) }
          : undefined,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'master_data.setting.create',
      entityType: 'Setting',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateSetting(id: string, dto: UpdateSettingDto, actorUserId?: string) {
    const existing = await this.prisma.setting.findUniqueOrThrow({ where: { id } });
    const { itemTypeIds, ...data } = dto;
    const row = await this.prisma.setting.update({
      where: { id },
      data: {
        ...data,
        itemTypes: itemTypeIds
          ? {
              deleteMany: {},
              create: itemTypeIds.map((itemTypeId) => ({ itemTypeId })),
            }
          : undefined,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'master_data.setting.update',
      entityType: 'Setting',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: Stone + StoneOption
  // ---------------------------------------------------------------------

  adminListStones() {
    return this.prisma.stone.findMany({ orderBy: { sortOrder: 'asc' }, include: { options: true } });
  }

  async adminCreateStone(dto: CreateStoneDto, actorUserId?: string) {
    const row = await this.prisma.stone.create({ data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.stone.create',
      entityType: 'Stone',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateStone(id: string, dto: UpdateStoneDto, actorUserId?: string) {
    const existing = await this.prisma.stone.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.stone.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.stone.update',
      entityType: 'Stone',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  async adminCreateStoneOption(stoneId: string, dto: CreateStoneOptionDto, actorUserId?: string) {
    await this.prisma.stone.findUniqueOrThrow({ where: { id: stoneId } });
    const row = await this.prisma.stoneOption.create({ data: { ...dto, stoneId } });
    await this.audit.log({
      actorUserId,
      action: 'master_data.stone_option.create',
      entityType: 'StoneOption',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateStoneOption(id: string, dto: UpdateStoneOptionDto, actorUserId?: string) {
    const existing = await this.prisma.stoneOption.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.stoneOption.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.stone_option.update',
      entityType: 'StoneOption',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: FinishType
  // ---------------------------------------------------------------------

  adminListFinishTypes() {
    return this.prisma.finishType.findMany({ orderBy: { code: 'asc' } });
  }

  async adminCreateFinishType(dto: CreateFinishTypeDto, actorUserId?: string) {
    const row = await this.prisma.finishType.create({ data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.finish_type.create',
      entityType: 'FinishType',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateFinishType(id: string, dto: UpdateFinishTypeDto, actorUserId?: string) {
    const existing = await this.prisma.finishType.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.finishType.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.finish_type.update',
      entityType: 'FinishType',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: ElementCatalog
  // ---------------------------------------------------------------------

  adminListElements() {
    return this.prisma.elementCatalog.findMany({ orderBy: { code: 'asc' } });
  }

  async adminCreateElement(dto: CreateElementDto, actorUserId?: string) {
    const row = await this.prisma.elementCatalog.create({ data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.element.create',
      entityType: 'ElementCatalog',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateElement(id: string, dto: UpdateElementDto, actorUserId?: string) {
    const existing = await this.prisma.elementCatalog.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.elementCatalog.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.element.update',
      entityType: 'ElementCatalog',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: Region
  // ---------------------------------------------------------------------

  adminListRegions() {
    return this.prisma.region.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async adminCreateRegion(dto: CreateRegionDto, actorUserId?: string) {
    const row = await this.prisma.region.create({ data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.region.create',
      entityType: 'Region',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateRegion(id: string, dto: UpdateRegionDto, actorUserId?: string) {
    const existing = await this.prisma.region.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.region.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.region.update',
      entityType: 'Region',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: SizeChart
  // ---------------------------------------------------------------------

  adminListSizeCharts(itemTypeId?: string) {
    return this.prisma.sizeChart.findMany({
      where: { itemTypeId },
      orderBy: [{ standard: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async adminCreateSizeChart(dto: CreateSizeChartDto, actorUserId?: string) {
    const row = await this.prisma.sizeChart.create({ data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.size_chart.create',
      entityType: 'SizeChart',
      entityId: row.id,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateSizeChart(id: string, dto: UpdateSizeChartDto, actorUserId?: string) {
    const existing = await this.prisma.sizeChart.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.sizeChart.update({ where: { id }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'master_data.size_chart.update',
      entityType: 'SizeChart',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // Admin: MeasurementGuide
  // ---------------------------------------------------------------------

  adminListMeasurementGuides(itemTypeId?: string) {
    return this.prisma.measurementGuide.findMany({ where: { itemTypeId } });
  }

  async adminUpsertMeasurementGuide(dto: CreateMeasurementGuideDto, actorUserId?: string) {
    const locale = dto.locale ?? 'he';
    const existing = await this.prisma.measurementGuide.findUnique({
      where: { itemTypeId_locale: { itemTypeId: dto.itemTypeId, locale } },
    });
    const row = await this.prisma.measurementGuide.upsert({
      where: { itemTypeId_locale: { itemTypeId: dto.itemTypeId, locale } },
      create: { itemTypeId: dto.itemTypeId, locale, title: dto.title, body: dto.body as Prisma.InputJsonValue },
      update: { title: dto.title, body: dto.body as Prisma.InputJsonValue },
    });
    await this.audit.log({
      actorUserId,
      action: existing ? 'master_data.measurement_guide.update' : 'master_data.measurement_guide.create',
      entityType: 'MeasurementGuide',
      entityId: row.id,
      before: existing ? toJsonValue(existing) : null,
      after: toJsonValue(row),
    });
    return row;
  }

  async adminUpdateMeasurementGuide(id: string, dto: UpdateMeasurementGuideDto, actorUserId?: string) {
    const existing = await this.prisma.measurementGuide.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.measurementGuide.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body !== undefined ? (dto.body as Prisma.InputJsonValue) : undefined,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'master_data.measurement_guide.update',
      entityType: 'MeasurementGuide',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });
    return row;
  }

  // ---------------------------------------------------------------------
  // ETL import
  // ---------------------------------------------------------------------

  async etlImport(entity: string, rows: Record<string, unknown>[], actorUserId?: string): Promise<EtlReport> {
    if (!ETL_ENTITIES.includes(entity as EtlEntity)) {
      throw new NotFoundException({
        success: false,
        message: `Unknown ETL entity "${entity}". Supported: ${ETL_ENTITIES.join(', ')}`,
      });
    }

    const report: EtlReport = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const code = typeof row.code === 'string' ? row.code : undefined;
      if (!code) {
        report.errors.push({ row: i, message: 'Missing required "code" field' });
        continue;
      }

      try {
        const { wasCreated } = await this.upsertByCode(entity as EtlEntity, code, row);
        if (wasCreated) {
          report.created += 1;
        } else {
          report.updated += 1;
        }
      } catch (err) {
        report.errors.push({ row: i, message: (err as Error).message });
      }
    }

    await this.audit.log({
      actorUserId,
      action: 'master_data.etl_import',
      entityType: entity,
      after: toJsonValue(report),
    });

    return report;
  }

  private async upsertByCode(
    entity: EtlEntity,
    code: string,
    row: Record<string, unknown>,
  ): Promise<{ wasCreated: boolean }> {
    const { code: _code, ...rest } = row;

    switch (entity) {
      case 'itemTypes': {
        const existing = await this.prisma.itemType.findUnique({ where: { code } });
        await this.prisma.itemType.upsert({
          where: { code },
          create: { code, labelHe: String(rest.labelHe ?? code), ...rest } as Prisma.ItemTypeCreateInput,
          update: rest as Prisma.ItemTypeUpdateInput,
        });
        return { wasCreated: !existing };
      }
      case 'metals': {
        const existing = await this.prisma.metal.findUnique({ where: { code } });
        await this.prisma.metal.upsert({
          where: { code },
          create: { code, labelHe: String(rest.labelHe ?? code), ...rest } as Prisma.MetalCreateInput,
          update: rest as Prisma.MetalUpdateInput,
        });
        return { wasCreated: !existing };
      }
      case 'settings': {
        const existing = await this.prisma.setting.findUnique({ where: { code } });
        await this.prisma.setting.upsert({
          where: { code },
          create: { code, labelHe: String(rest.labelHe ?? code), ...rest } as Prisma.SettingCreateInput,
          update: rest as Prisma.SettingUpdateInput,
        });
        return { wasCreated: !existing };
      }
      case 'stones': {
        const existing = await this.prisma.stone.findUnique({ where: { code } });
        await this.prisma.stone.upsert({
          where: { code },
          create: { code, nameHe: String(rest.nameHe ?? code), ...rest } as Prisma.StoneCreateInput,
          update: rest as Prisma.StoneUpdateInput,
        });
        return { wasCreated: !existing };
      }
      case 'finishTypes': {
        const existing = await this.prisma.finishType.findUnique({ where: { code } });
        await this.prisma.finishType.upsert({
          where: { code },
          create: { code, labelHe: String(rest.labelHe ?? code), ...rest } as Prisma.FinishTypeCreateInput,
          update: rest as Prisma.FinishTypeUpdateInput,
        });
        return { wasCreated: !existing };
      }
      case 'elements': {
        const existing = await this.prisma.elementCatalog.findUnique({ where: { code } });
        await this.prisma.elementCatalog.upsert({
          where: { code },
          create: { code, labelHe: String(rest.labelHe ?? code), ...rest } as Prisma.ElementCatalogCreateInput,
          update: rest as Prisma.ElementCatalogUpdateInput,
        });
        return { wasCreated: !existing };
      }
      case 'regions': {
        const existing = await this.prisma.region.findUnique({ where: { code } });
        await this.prisma.region.upsert({
          where: { code },
          create: { code, labelHe: String(rest.labelHe ?? code), ...rest } as Prisma.RegionCreateInput,
          update: rest as Prisma.RegionUpdateInput,
        });
        return { wasCreated: !existing };
      }
      default:
        throw new Error(`Unsupported ETL entity "${entity}"`);
    }
  }
}
