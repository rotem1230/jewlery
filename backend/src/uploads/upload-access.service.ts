import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DesignStatus, ProfilePublishStatus, Upload, User, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { designPictureReferences } from './design-pictures';

const SIGNATURE_HEX = /^[a-f0-9]{64}$/;

/**
 * Decides who may read an uploaded file and mints short-lived signed URLs for private media.
 *
 * Public (served to anyone): seed showcase assets, avatars of active users, logos / portfolio
 * images of PUBLISHED jeweler profiles, thumbnails of PUBLISHED or COMPLETED designs.
 * Everything else (chat images and voice notes, selfies, AI / render outputs, drafts) needs a
 * signed URL issued to an authorized caller, or the bearer token of the owner / a conversation
 * participant / an admin.
 */
@Injectable()
export class UploadAccessService {
  private readonly key: Buffer;
  private readonly defaultTtlSeconds: number;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const material = config.get<string>('uploads.urlSecret') || config.getOrThrow<string>('jwt.secret');
    // Derived, purpose-bound key: a leaked signed URL never reveals anything about JWT signing.
    this.key = createHmac('sha256', material).update('malinvosky:upload-url:v1').digest();
    this.defaultTtlSeconds = config.get<number>('uploads.signedUrlTtlSeconds', 3600);
  }

  private signature(uploadId: string, exp: number): string {
    return createHmac('sha256', this.key).update(`${uploadId}:${exp}`).digest('hex');
  }

  /** Path relative to the API prefix, e.g. `/uploads/<id>/content?exp=..&sig=..`. */
  signedContentPath(uploadId: string, ttlSeconds: number = this.defaultTtlSeconds): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `/uploads/${uploadId}/content?exp=${exp}&sig=${this.signature(uploadId, exp)}`;
  }

  hasValidSignature(uploadId: string, exp: unknown, sig: unknown): boolean {
    if (typeof exp !== 'string' || !/^\d{1,12}$/.test(exp) || typeof sig !== 'string' || !SIGNATURE_HEX.test(sig)) {
      return false;
    }
    const expiresAt = Number(exp);
    if (expiresAt < Math.floor(Date.now() / 1000)) {
      return false;
    }
    return timingSafeEqual(Buffer.from(this.signature(uploadId, expiresAt), 'hex'), Buffer.from(sig, 'hex'));
  }

  urlFor(uploadId: string | null | undefined): string | null {
    return uploadId ? this.signedContentPath(uploadId) : null;
  }

  withUrl<T extends { id: string }>(upload: T): T & { contentUrl: string } {
    return { ...upload, contentUrl: this.signedContentPath(upload.id) };
  }

  /**
   * Public only when the upload's own owner publishes it (avatar, published logo / portfolio,
   * thumbnail of a listed design). A reference from someone else's record never publishes it.
   */
  async isPublic(upload: Pick<Upload, 'id' | 'objectKey' | 'ownerUserId'>): Promise<boolean> {
    if (upload.objectKey.startsWith('seed/')) {
      return true;
    }
    const owner = upload.ownerUserId;
    const [avatars, logos, portfolio, thumbnails, designPictures] = await Promise.all([
      this.prisma.user.count({ where: { id: owner, avatarUploadId: upload.id, deletedAt: null } }),
      this.prisma.jewelerProfile.count({
        where: { userId: owner, logoUploadId: upload.id, publishStatus: ProfilePublishStatus.PUBLISHED },
      }),
      this.prisma.portfolioItem.count({
        where: { uploadId: upload.id, profile: { userId: owner, publishStatus: ProfilePublishStatus.PUBLISHED } },
      }),
      this.prisma.design.count({
        where: {
          ownerUserId: owner,
          thumbnailUploadId: upload.id,
          deletedAt: null,
          status: { in: [DesignStatus.PUBLISHED, DesignStatus.COMPLETED] },
        },
      }),
      // Pictures a listed design is specified with (PRD 5.4): its inspiration and custom elements,
      // which the jewelers pricing it need to see.
      this.prisma.design.count({
        where: {
          ownerUserId: owner,
          deletedAt: null,
          status: { in: [DesignStatus.PUBLISHED, DesignStatus.COMPLETED] },
          OR: designPictureReferences(upload.id),
        },
      }),
    ]);
    return avatars + logos + portfolio + thumbnails + designPictures > 0;
  }

  async canRead(upload: Pick<Upload, 'id' | 'ownerUserId'>, user: Pick<User, 'id' | 'roles'>): Promise<boolean> {
    if (upload.ownerUserId === user.id || user.roles.includes(UserRole.ADMIN)) {
      return true;
    }
    // Shared only by its owner's own message in a conversation the reader still takes part in.
    const shared = await this.prisma.message.count({
      where: {
        imageUploadId: upload.id,
        senderId: upload.ownerUserId,
        conversation: { participants: { some: { userId: user.id, leftAt: null } } },
      },
    });
    return shared > 0;
  }
}
