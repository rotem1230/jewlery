import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JewelryModel, JewelrySpec, buildJewelry, specFromParameters } from './geometry';
import { modelToObj } from './obj';
import { RgbaImage, decodePng, encodePngAsync } from './png';
import { RenderOptions, renderModelAsync } from './renderer';
import { modelToStl } from './stl';

/** What a design is built from. */
export type DesignShape = { id: string; itemTypeId: string; parameters: Prisma.JsonValue; version?: number };

export type PictureOptions = Pick<RenderOptions, 'size' | 'supersample' | 'background' | 'view'> & { watermark?: boolean };

/**
 * Turns a design's stored parameters into the files made from them — STL / OBJ for manufacturing
 * and rendered PNG pictures — through the shared parametric geometry, so every output shows the
 * same piece the 3D studio shows.
 *
 * Pictures render one at a time per process (exports, previews, try-ons and overlays share one
 * lane): each holds tens of megabytes of buffers, and a small host cannot hold several at once.
 */
@Injectable()
export class JewelryRenderService {
  private readonly logger = new Logger(JewelryRenderService.name);
  private readonly itemTypeCodes = new Map<string, string>();
  private watermarkImage: RgbaImage | null | undefined;
  private lane: Promise<unknown> = Promise.resolve();

  /** Runs `work` after every render queued before it (one picture in memory at a time). */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lane.then(work);
    this.lane = run.catch(() => undefined);
    return run;
  }

  constructor(private readonly prisma: PrismaService) {}

  private async itemTypeCode(itemTypeId: string): Promise<string> {
    const cached = this.itemTypeCodes.get(itemTypeId);
    if (cached) return cached;
    const row = await this.prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { code: true } });
    const code = row?.code ?? 'RING';
    this.itemTypeCodes.set(itemTypeId, code);
    return code;
  }

  /** Mean inner diameter of the design's ring size in the size chart, when the chart has it. */
  private async ringChartDiameter(itemTypeId: string, parameters: Prisma.JsonValue): Promise<number | null> {
    const size = (parameters as { size?: { standard?: unknown; sizeCode?: unknown } } | null)?.size;
    if (typeof size?.standard !== 'string' || typeof size?.sizeCode !== 'string') return null;
    const row = await this.prisma.sizeChart.findFirst({
      where: { itemTypeId, standard: size.standard, sizeCode: size.sizeCode, isActive: true },
      select: { diameterMinMm: true, diameterMaxMm: true },
    });
    const min = row?.diameterMinMm != null ? Number(row.diameterMinMm) : null;
    const max = row?.diameterMaxMm != null ? Number(row.diameterMaxMm) : null;
    if (min != null && max != null) return (min + max) / 2;
    return min ?? max;
  }

  async spec(design: DesignShape): Promise<JewelrySpec> {
    const code = await this.itemTypeCode(design.itemTypeId);
    const chart = code === 'RING' ? await this.ringChartDiameter(design.itemTypeId, design.parameters) : null;
    return specFromParameters(code, design.parameters, { ringChartDiameterMm: chart });
  }

  async model(design: DesignShape): Promise<JewelryModel> {
    return buildJewelry(await this.spec(design));
  }

  private header(design: DesignShape): string {
    return `Malinvosky design ${design.id}${design.version != null ? ` v${design.version}` : ''} (mm)`;
  }

  async stl(design: DesignShape): Promise<Buffer> {
    return modelToStl(await this.model(design), this.header(design));
  }

  async obj(design: DesignShape): Promise<Buffer> {
    return modelToObj(await this.model(design), this.header(design));
  }

  async picture(design: DesignShape, options: PictureOptions): Promise<Buffer> {
    const model = await this.model(design);
    return this.exclusive(async () =>
      encodePngAsync(
        await renderModelAsync(model, {
          size: options.size,
          supersample: options.supersample,
          background: options.background,
          view: options.view,
          watermark: options.watermark ? this.watermark() : null,
        }),
      ),
    );
  }

  /** Transparent picture of the design (for placing over a photo), in the shared render lane. */
  async cutout(design: DesignShape, size: number): Promise<RgbaImage> {
    const model = await this.model(design);
    return this.exclusive(() => renderModelAsync(model, { size, supersample: 2, background: 'transparent' }));
  }

  /** The brand mark stamped on free-plan pictures (seed-assets/brand, shipped in the image). */
  private watermark(): RgbaImage | null {
    if (this.watermarkImage !== undefined) return this.watermarkImage;
    const path = join(__dirname, '..', '..', 'seed-assets', 'brand', 'malinovsky-logo.png');
    const fallback = join(process.cwd(), 'seed-assets', 'brand', 'malinovsky-logo.png');
    try {
      const file = existsSync(path) ? path : fallback;
      this.watermarkImage = decodePng(readFileSync(file));
    } catch (err) {
      this.logger.warn(`Watermark image unavailable: ${(err as Error).message}`);
      this.watermarkImage = null;
    }
    return this.watermarkImage;
  }
}
