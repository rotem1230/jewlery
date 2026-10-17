import { createHash } from 'crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JewelrySpec } from '../jewelry/geometry';
import { stableJson } from './design-fingerprint';
import { PrismaService } from '../database/prisma.service';
import { JewelryRenderService } from '../jewelry/jewelry-render.service';
import { UploadsService } from '../uploads/uploads.service';

/** Pixels per side of a design's preview picture (rendered with 2×2 supersampling). */
export const PREVIEW_SIZE = 640;
/** Bump when the geometry or renderer changes how pieces look: every picture is redrawn. */
export const PREVIEW_RENDER_VERSION = 1;

/** What a picture depends on: the piece's spec and the renderer version (not titles or notes). */
export function previewKey(spec: JewelrySpec): string {
  return createHash('sha256').update(`${PREVIEW_RENDER_VERSION}:${PREVIEW_SIZE}:${stableJson(spec)}`).digest('hex');
}

/**
 * Keeps a rendered picture of every design's current parameters (`Design.previewUploadId`), so
 * lists, chats and quotes show the piece itself. Renders run one at a time in the background:
 * a save asks for one (`schedule`), and a sweep (`backfill`) catches designs saved while the
 * process was down. A picture is attached only if the design did not change while it rendered.
 */
@Injectable()
export class DesignPreviewService implements OnModuleDestroy {
  private readonly logger = new Logger(DesignPreviewService.name);
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private draining: Promise<void> | null = null;
  /** Renders run one after another (the queue and the sweep share this lane). */
  private lane: Promise<unknown> = Promise.resolve();
  private stopped = false;
  /** Designs whose picture failed to render, by the version that failed (skipped by the sweep). */
  private readonly failed = new Map<string, number>();
  /** DESIGN_PREVIEWS=off stops automatic rendering after saves (the e2e suites keep it off). */
  private readonly automatic = (process.env.DESIGN_PREVIEWS ?? 'on').toLowerCase() !== 'off';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jewelry: JewelryRenderService,
    private readonly uploads: UploadsService,
  ) {}

  /** Asks for the design's picture to be rendered soon. Cheap and never throws. */
  schedule(designId: string): void {
    if (this.stopped || !this.automatic || this.queued.has(designId)) return;
    this.queued.add(designId);
    this.queue.push(designId);
    if (!this.draining) this.draining = this.drain().finally(() => (this.draining = null));
  }

  private async drain(): Promise<void> {
    while (this.queue.length && !this.stopped) {
      const id = this.queue.shift()!;
      this.queued.delete(id);
      try {
        await this.refresh(id);
      } catch (err) {
        this.logger.warn(`Preview of design ${id} failed: ${(err as Error).message}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.queue.length = 0;
    this.queued.clear();
    await this.draining;
  }

  /**
   * Renders the picture of the design's current version unless it already has one; returns the
   * upload holding it (null for a missing / deleted design).
   */
  refresh(designId: string): Promise<string | null> {
    const run = this.lane.then(() => this.render(designId));
    this.lane = run.catch(() => undefined);
    return run;
  }

  private async render(designId: string): Promise<string | null> {
    const design = await this.prisma.design.findFirst({
      where: { id: designId, deletedAt: null },
      select: {
        id: true,
        itemTypeId: true,
        parameters: true,
        version: true,
        ownerUserId: true,
        previewUploadId: true,
        previewVersion: true,
        previewKey: true,
      },
    });
    if (!design) return null;
    if (design.previewUploadId && design.previewVersion === design.version) return design.previewUploadId;

    const key = previewKey(await this.jewelry.spec(design));
    // Raw updates: attaching a picture is not an edit, so they must not move `updatedAt` (lists
    // sort by it) nor the optimistic-concurrency `version`.
    if (design.previewUploadId && design.previewKey === key) {
      // The version moved but the piece did not (title, notes, publishing): same picture.
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "designs" SET "previewVersion" = ${design.version}
         WHERE "id" = ${design.id}::uuid AND "version" = ${design.version} AND "previewUploadId" = ${design.previewUploadId}::uuid`);
      return design.previewUploadId;
    }

    let png: Buffer;
    try {
      png = await this.jewelry.picture(design, { size: PREVIEW_SIZE, supersample: 2, background: 'studio' });
    } catch (err) {
      this.failed.set(design.id, design.version);
      throw err;
    }
    this.failed.delete(design.id);
    const upload = await this.uploads.createGeneratedLocal(design.ownerUserId, png, 'image/png');
    // Only if the design is still at this version and nobody attached another picture meanwhile
    // (another instance rendering the same design).
    const attached = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "designs" SET "previewUploadId" = ${upload.id}::uuid, "previewVersion" = ${design.version}, "previewKey" = ${key}
       WHERE "id" = ${design.id}::uuid AND "version" = ${design.version} AND "deletedAt" IS NULL
         AND "previewUploadId" IS NOT DISTINCT FROM ${design.previewUploadId}::uuid`);
    if (attached !== 1) {
      // Changed (or deleted) while rendering: drop this picture; the newer version gets its own.
      await this.uploads.discard(upload);
      this.schedule(design.id);
      return null;
    }
    if (design.previewUploadId && design.previewUploadId !== upload.id) {
      await this.discardIfUnused(design.previewUploadId);
    }
    return upload.id;
  }

  private async discardIfUnused(uploadId: string): Promise<void> {
    const old = await this.prisma.upload.findFirst({ where: { id: uploadId, deletedAt: null } });
    if (old && !(await this.uploads.isReferencedElsewhere(old.id))) {
      await this.uploads.discard(old);
    }
  }

  /**
   * Renders up to `batch` designs whose picture is missing or older than their current version.
   * A design whose render failed at its current version is left out (until it changes), so one
   * broken design cannot hold the sweep back.
   */
  async backfill(batch = 5): Promise<number> {
    const skip = [...this.failed.entries()].map(([id, version]) => `${id}:${version}`);
    const stale = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "designs"
       WHERE "deletedAt" IS NULL
         AND ("previewUploadId" IS NULL OR "previewVersion" IS DISTINCT FROM "version")
         AND NOT (("id"::text || ':' || "version"::text) = ANY(${skip}::text[]))
       ORDER BY "updatedAt" DESC
       LIMIT ${batch}`);
    let rendered = 0;
    for (const { id } of stale) {
      if (this.stopped) break;
      try {
        if (await this.refresh(id)) rendered++;
      } catch (err) {
        this.logger.warn(`Preview backfill of design ${id} failed: ${(err as Error).message}`);
      }
    }
    return rendered;
  }
}
