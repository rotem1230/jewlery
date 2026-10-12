import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, normalize, sep } from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Upload, UploadStatus } from '@prisma/client';
import { AppConfigService } from '../cms/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { contentMatchesMimeType } from './file-signature';
import { UploadAccessService } from './upload-access.service';
import { DEFAULT_UPLOAD_LIMITS, UploadLimits } from './uploads.constants';
import { lockUser } from '../database/row-locks';

export type PresignResult = {
  uploadId: string;
  uploadUrl: string;
  objectKey: string;
  bucket: string;
  expiresInSeconds: number;
};

export type ServableUpload = { upload: Upload; path: string };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Object keys of server-generated outputs (stored under uploads-local/generated/). */
const GENERATED_PREFIX = 'local/generated/';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
    private readonly access: UploadAccessService,
  ) {}

  /** AppConfig `upload_limits`, with every missing / malformed field taken from the defaults. */
  private async getLimits(): Promise<UploadLimits> {
    const configured = await this.appConfig.get('upload_limits');
    const c = configured && typeof configured === 'object' && !Array.isArray(configured)
      ? (configured as Record<string, unknown>)
      : {};
    const number = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
    return {
      maxBytes: number(c.maxBytes, DEFAULT_UPLOAD_LIMITS.maxBytes),
      allowedMimeTypes:
        Array.isArray(c.allowedMimeTypes) && c.allowedMimeTypes.every((m) => typeof m === 'string')
          ? (c.allowedMimeTypes as string[])
          : DEFAULT_UPLOAD_LIMITS.allowedMimeTypes,
      dailyMaxBytes: number(c.dailyMaxBytes, DEFAULT_UPLOAD_LIMITS.dailyMaxBytes),
      dailyMaxFiles: number(c.dailyMaxFiles, DEFAULT_UPLOAD_LIMITS.dailyMaxFiles),
    };
  }

  private extensionFor(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'model/gltf-binary': 'glb',
      'model/stl': 'stl',
    };
    return map[mimeType] ?? 'bin';
  }

  /**
   * Presigned direct-to-object-storage uploads need a real S3 driver, which does not exist yet.
   * The fake presign flow is kept for local development only.
   */
  private assertPresignAvailable(): void {
    if (this.config.get<string>('nodeEnv') === 'production') {
      throw new NotImplementedException({
        success: false,
        message: 'Presigned uploads are not available; upload with POST /uploads',
        code: 'PRESIGN_NOT_AVAILABLE',
      });
    }
  }

  async createPresign(
    ownerUserId: string,
    mimeType: string,
    sizeBytes: number,
    checksumSha256?: string,
  ): Promise<PresignResult> {
    this.assertPresignAvailable();
    const limits = await this.getLimits();

    if (!limits.allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException({
        success: false,
        message: `MIME type "${mimeType}" is not allowed`,
        code: 'UPLOAD_MIME_REJECTED',
      });
    }
    if (sizeBytes > limits.maxBytes) {
      throw new BadRequestException({
        success: false,
        message: `File exceeds maximum size of ${limits.maxBytes} bytes`,
        code: 'UPLOAD_TOO_LARGE',
      });
    }

    const bucket = this.config.get<string>('s3.bucket', 'local-dev');
    const endpoint = this.config.get<string>('s3.endpoint');
    const objectKey = `${ownerUserId}/${randomUUID()}.${this.extensionFor(mimeType)}`;

    const upload = await this.prisma.upload.create({
      data: {
        ownerUserId,
        bucket,
        objectKey,
        mimeType,
        sizeBytes,
        checksumSha256: checksumSha256 ?? null,
        status: UploadStatus.PENDING,
      },
    });

    const baseUrl = endpoint ?? 'https://local-dev-uploads.invalid';
    const uploadUrl = `${baseUrl}/${bucket}/${objectKey}?X-Fake-Presign=true&uploadId=${upload.id}`;

    return {
      uploadId: upload.id,
      uploadUrl,
      objectKey,
      bucket,
      expiresInSeconds: 900,
    };
  }

  async confirm(uploadId: string, userId: string): Promise<Upload> {
    this.assertPresignAvailable();
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) {
      throw new NotFoundException({ success: false, message: 'Upload not found' });
    }
    if (upload.ownerUserId !== userId) {
      throw new ForbiddenException({ success: false, message: 'Not the upload owner' });
    }
    if (upload.status === UploadStatus.READY) {
      return upload;
    }
    if (upload.status !== UploadStatus.PENDING) {
      throw new BadRequestException({
        success: false,
        message: `Upload is in status ${upload.status} and cannot be confirmed`,
      });
    }

    return this.prisma.upload.update({
      where: { id: uploadId },
      data: { status: UploadStatus.READY, readyAt: new Date() },
    });
  }

  /**
   * Personal uploads in the last 24 h. Generated outputs (exports, AI models, try-ons) are capped by
   * their own job quotas and do not use up the user's upload budget.
   */
  private async assertDailyQuota(
    db: Prisma.TransactionClient,
    ownerUserId: string,
    incomingBytes: number,
    limits: UploadLimits,
  ): Promise<void> {
    const since = new Date(Date.now() - DAY_MS);
    const usage = await db.upload.aggregate({
      where: { ownerUserId, createdAt: { gt: since }, NOT: { objectKey: { startsWith: GENERATED_PREFIX } } },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    });
    const usedBytes = usage._sum.sizeBytes ?? 0;
    if (usage._count._all >= limits.dailyMaxFiles || usedBytes + incomingBytes > limits.dailyMaxBytes) {
      throw new HttpException(
        {
          success: false,
          message: 'Daily upload limit reached, please try again tomorrow',
          code: 'UPLOAD_QUOTA_EXCEEDED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Direct upload to local storage under `uploads-local/` (server-generated file name). The
   * declared type must be allowed AND match the file's leading bytes; per-user daily volume is
   * capped. Returns the READY row plus a signed `contentUrl` for the owner.
   */
  async createLocal(
    ownerUserId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ): Promise<Upload & { contentUrl: string }> {
    const limits = await this.getLimits();
    if (!limits.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        success: false,
        message: `MIME type "${file.mimetype}" is not allowed`,
        code: 'UPLOAD_MIME_REJECTED',
      });
    }
    if (file.size > limits.maxBytes) {
      throw new BadRequestException({
        success: false,
        message: `File exceeds maximum size of ${limits.maxBytes} bytes`,
        code: 'UPLOAD_TOO_LARGE',
      });
    }
    if (!contentMatchesMimeType(file.mimetype, file.buffer)) {
      throw new BadRequestException({
        success: false,
        message: 'File content does not match its declared type',
        code: 'UPLOAD_CONTENT_MISMATCH',
      });
    }
    const dir = join(process.cwd(), 'uploads-local');
    mkdirSync(dir, { recursive: true });
    // Server-generated name only — never user input (traversal-safe).
    const filename = `${randomUUID()}.${this.extensionFor(file.mimetype)}`;
    const path = join(dir, filename);

    // Quota check, file and row under the user's row lock: simultaneous uploads cannot all pass
    // the check, and a failed save removes the file instead of leaving an untracked orphan.
    try {
      const upload = await this.prisma.$transaction(async (tx) => {
        await lockUser(tx, ownerUserId);
        await this.assertDailyQuota(tx, ownerUserId, file.size, limits);
        writeFileSync(path, file.buffer, { mode: 0o600 });
        return tx.upload.create({
          data: {
            ownerUserId,
            bucket: 'local-dev',
            objectKey: `local/${filename}`,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            status: UploadStatus.READY,
            readyAt: new Date(),
          },
        });
      });
      return this.access.withUrl(upload);
    } catch (err) {
      rmSync(path, { force: true });
      throw err;
    }
  }

  /** Server-written file (AI / render / try-on output). Skips the chat MIME allowlist. */
  async createGeneratedLocal(ownerUserId: string, bytes: Buffer, mimeType: string): Promise<Upload> {
    const dir = join(process.cwd(), 'uploads-local', 'generated');
    mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}.${this.extensionFor(mimeType)}`;
    const path = join(dir, filename);
    writeFileSync(path, bytes, { mode: 0o600 });
    try {
      return await this.prisma.upload.create({
        data: {
          ownerUserId,
          bucket: 'local-dev',
          objectKey: `${GENERATED_PREFIX}${filename}`,
          mimeType,
          sizeBytes: bytes.length,
          status: UploadStatus.READY,
          readyAt: new Date(),
        },
      });
    } catch (err) {
      rmSync(path, { force: true });
      throw err;
    }
  }

  private localBaseDirs(): { seedDir: string; localDir: string } {
    return {
      seedDir: join(__dirname, '..', '..', 'seed-assets'),
      localDir: join(process.cwd(), 'uploads-local'),
    };
  }

  /** Absolute path of a locally stored upload, confined to its storage root (traversal-safe). */
  private resolveLocalPath(upload: Pick<Upload, 'bucket' | 'objectKey'>): string | null {
    if (upload.bucket !== 'local-dev') {
      return null;
    }
    const { seedDir, localDir } = this.localBaseDirs();
    if (upload.objectKey.startsWith('seed/')) {
      const resolved = normalize(join(seedDir, upload.objectKey.slice('seed/'.length)));
      return resolved.startsWith(seedDir + sep) ? resolved : null;
    }
    if (upload.objectKey.startsWith('local/')) {
      const resolved = normalize(join(localDir, upload.objectKey.slice('local/'.length)));
      return resolved.startsWith(localDir + sep) ? resolved : null;
    }
    return null;
  }

  /** A READY, not-deleted, locally stored upload together with its file path; otherwise null. */
  async findServable(uploadId: string): Promise<ServableUpload | null> {
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload || upload.deletedAt || upload.status !== UploadStatus.READY) {
      return null;
    }
    const path = this.resolveLocalPath(upload);
    if (!path || !existsSync(path)) {
      return null;
    }
    return { upload, path };
  }

  /**
   * Whether anything other than the given visualization jobs refers to the upload, so deleting it
   * would break a profile, a design, a conversation or another job.
   */
  async isReferencedElsewhere(uploadId: string, ignoreVisualizationJobIds: string[] = []): Promise<boolean> {
    const counts = await Promise.all([
      this.prisma.user.count({ where: { avatarUploadId: uploadId } }),
      this.prisma.design.count({ where: { thumbnailUploadId: uploadId } }),
      this.prisma.jewelerProfile.count({ where: { logoUploadId: uploadId } }),
      this.prisma.jewelerOnboardingDraft.count({ where: { logoUploadId: uploadId } }),
      this.prisma.portfolioItem.count({ where: { uploadId } }),
      this.prisma.message.count({ where: { imageUploadId: uploadId } }),
      this.prisma.designAsset.count({ where: { uploadId } }),
      this.prisma.aiGenerationJob.count({ where: { outputUploadId: uploadId } }),
      this.prisma.renderJob.count({ where: { outputUploadId: uploadId } }),
      this.prisma.visualizationJob.count({
        where: {
          id: { notIn: ignoreVisualizationJobIds },
          purgedAt: null,
          OR: [{ inputUploadId: uploadId }, { outputUploadId: uploadId }],
        },
      }),
    ]);
    return counts.some((count) => count > 0);
  }

  /** Withdraws an upload nobody references (e.g. a result that arrived too late): row and bytes. */
  async discard(upload: Pick<Upload, 'id' | 'bucket' | 'objectKey'>): Promise<void> {
    await this.prisma.upload.update({
      where: { id: upload.id },
      data: { status: UploadStatus.DELETED, deletedAt: new Date() },
    });
    this.deleteStoredFile(upload);
  }

  /** Removes the stored bytes of a locally stored, non-seed upload (seed assets are shared). */
  deleteStoredFile(upload: Pick<Upload, 'bucket' | 'objectKey'>): void {
    if (!upload.objectKey.startsWith('local/')) {
      return;
    }
    const path = this.resolveLocalPath(upload);
    if (path) {
      try {
        rmSync(path, { force: true });
      } catch (err) {
        this.logger.warn(`Could not delete stored file ${upload.objectKey}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Validates that `uploadId` can be attached to something the caller publishes (avatar,
   * thumbnail, logo, portfolio): it must be the caller's own READY image.
   */
  async assertOwnedImage(uploadId: string, ownerUserId: string, field: string): Promise<void> {
    const upload = await this.prisma.upload.findFirst({
      where: { id: uploadId, ownerUserId, deletedAt: null, status: UploadStatus.READY },
      select: { mimeType: true },
    });
    if (!upload || !upload.mimeType.startsWith('image/')) {
      throw new BadRequestException({
        success: false,
        message: `${field} must reference an image uploaded by the current user`,
      });
    }
  }
}
