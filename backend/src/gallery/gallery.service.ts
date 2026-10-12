import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { PrismaService } from '../database/prisma.service';
import { CreateGalleryItemDto, UpdateGalleryItemDto } from './dto/gallery.dto';

const DESIGN_PREVIEW_SELECT = {
  id: true,
  title: true,
  status: true,
  thumbnailUploadId: true,
  itemType: { select: { code: true, labelHe: true, labelEn: true } },
} satisfies Prisma.DesignSelect;

@Injectable()
export class GalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.galleryItem.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { design: { select: DESIGN_PREVIEW_SELECT } },
    });
  }

  adminList() {
    return this.prisma.galleryItem.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { design: { select: DESIGN_PREVIEW_SELECT } },
    });
  }

  async adminCreate(dto: CreateGalleryItemDto, actorUserId?: string) {
    const design = await this.prisma.design.findUnique({ where: { id: dto.designId } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }

    const row = await this.prisma.galleryItem.create({
      data: {
        designId: dto.designId,
        sortOrder: dto.sortOrder ?? 0,
        captionHe: dto.captionHe,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'gallery.create',
      entityType: 'GalleryItem',
      entityId: row.id,
      after: toJsonValue(row),
    });

    return row;
  }

  async adminUpdate(id: string, dto: UpdateGalleryItemDto, actorUserId?: string) {
    const existing = await this.prisma.galleryItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ success: false, message: 'Gallery item not found' });
    }

    const row = await this.prisma.galleryItem.update({
      where: { id },
      data: {
        designId: dto.designId,
        sortOrder: dto.sortOrder,
        captionHe: dto.captionHe,
        isActive: dto.isActive,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'gallery.update',
      entityType: 'GalleryItem',
      entityId: id,
      before: toJsonValue(existing),
      after: toJsonValue(row),
    });

    return row;
  }

  async adminRemove(id: string, actorUserId?: string) {
    const existing = await this.prisma.galleryItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ success: false, message: 'Gallery item not found' });
    }

    await this.prisma.galleryItem.delete({ where: { id } });

    await this.audit.log({
      actorUserId,
      action: 'gallery.delete',
      entityType: 'GalleryItem',
      entityId: id,
      before: toJsonValue(existing),
    });
  }
}
