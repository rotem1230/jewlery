import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, normalize, sep } from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
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
import { STORAGE_DRIVERS, StorageDriver } from '../config/configuration';
import { PrismaService } from '../database/prisma.service';
import { designPictureReferences } from './design-pictures';
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

/** A READY upload whose bytes exist: a file on disk, or a blob read once access is granted. */
export type ServableUpload =
  | { upload: Upload; storage: 'local'; path: string }
  | { upload: Upload; storage: 'database' };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Bucket of files on this machine's disk (`local/` under uploads-local/, `seed/` under seed-assets/). */
const LOCAL_BUCKET = 'local-dev';
/** Bucket of files kept in `upload_blobs` (keys `db/<uuid>.<ext>`, generated ones `db/generated/...`). */
const DATABASE_BUCKET = 'database';
/** Object keys of server-generated outputs; they are capped by their own job quotas. */
const GENERATED_PREFIXES = ['local/generated/', 'db/generated/'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Writing a file of up to the upload limit into the database can outlast the 5 s default. */
const DATABASE_WRITE_TIMEOUT_MS = 30_000;

/** Prisma returns Bytes as a Uint8Array; callers get a Buffer over the same memory (no copy). */
function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Prisma's Bytes input type; a Node Buffer is always backed by a plain ArrayBuffer. */
function asBytes(buffer: Buffer): Prisma.Bytes {
  return buffer as Prisma.Bytes;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  /** Where new files are written. Existing rows are always read from where they were written. */
  private readonly driver: StorageDriver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
    private readonly access: UploadAccessService,
  ) {
    const driver = this.config.get<string>('storage.driver', 'local');
    if (!(STORAGE_DRIVERS as readonly string[]).includes(driver)) {
      throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected one of: ${STORAGE_DRIVERS.join(', ')})`);
    }
    this.driver = driver as StorageDriver;
    if (this.driver === 'local' && this.config.get<string>('nodeEnv') === 'production') {
      this.logger.warn(
        'STORAGE_DRIVER=local in production: files are kept on this machine\'s disk and are lost when it is ' +
          'replaced (every deploy on a host without a persistent disk)',
      );
    }
  }

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
      'image/webp': 'webp',
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
      where: {
        ownerUserId,
        createdAt: { gt: since },
        NOT: GENERATED_PREFIXES.map((prefix) => ({ objectKey: { startsWith: prefix } })),
      },
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
   * Direct upload, stored by the configured driver (database blob, or a file under
   * `uploads-local/`) under a server-generated name. The declared type must be allowed AND match
   * the file's leading bytes; per-user daily volume is capped. Returns the READY row plus a signed
   * `contentUrl` for the owner.
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
    // Server-generated name only — never user input (traversal-safe).
    const filename = `${randomUUID()}.${this.extensionFor(file.mimetype)}`;

    if (this.driver === 'database') {
      // Quota check, row and bytes in one transaction under the user's row lock: simultaneous
      // uploads cannot all pass the check, and a failed save leaves neither row nor bytes.
      const upload = await this.prisma.$transaction(
        async (tx) => {
          await lockUser(tx, ownerUserId);
          await this.assertDailyQuota(tx, ownerUserId, file.size, limits);
          return tx.upload.create({
            data: {
              ownerUserId,
              bucket: DATABASE_BUCKET,
              objectKey: `db/${filename}`,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              status: UploadStatus.READY,
              readyAt: new Date(),
              blob: { create: { data: asBytes(file.buffer) } },
            },
          });
        },
        { timeout: DATABASE_WRITE_TIMEOUT_MS },
      );
      return this.access.withUrl(upload);
    }

    const dir = join(process.cwd(), 'uploads-local');
    mkdirSync(dir, { recursive: true });
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
            bucket: LOCAL_BUCKET,
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

  /**
   * Server-written file (AI / render / try-on output, design preview), stored by the configured
   * driver. Skips the chat MIME allowlist and the personal upload quota.
   */
  async createGeneratedLocal(ownerUserId: string, bytes: Buffer, mimeType: string): Promise<Upload> {
    const filename = `${randomUUID()}.${this.extensionFor(mimeType)}`;
    if (this.driver === 'database') {
      // Nested create: the row and its bytes are written in one transaction.
      return this.prisma.upload.create({
        data: {
          ownerUserId,
          bucket: DATABASE_BUCKET,
          objectKey: `db/generated/${filename}`,
          mimeType,
          sizeBytes: bytes.length,
          status: UploadStatus.READY,
          readyAt: new Date(),
          blob: { create: { data: asBytes(bytes) } },
        },
      });
    }

    const dir = join(process.cwd(), 'uploads-local', 'generated');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, filename);
    writeFileSync(path, bytes, { mode: 0o600 });
    try {
      return await this.prisma.upload.create({
        data: {
          ownerUserId,
          bucket: LOCAL_BUCKET,
          objectKey: `local/generated/${filename}`,
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
    if (upload.bucket !== LOCAL_BUCKET) {
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

  /**
   * A READY, not-deleted upload whose bytes exist (a database blob, or a local / seed file and its
   * path); otherwise null. Blob bytes are not loaded here: read them with `readBytes` once the
   * caller is allowed to see them.
   */
  async findServable(uploadId: string): Promise<ServableUpload | null> {
    const found = await this.prisma.upload.findUnique({
      where: { id: uploadId },
      include: { blob: { select: { uploadId: true } } },
    });
    if (!found || found.deletedAt || found.status !== UploadStatus.READY) {
      return null;
    }
    const { blob, ...upload } = found;
    if (upload.bucket === DATABASE_BUCKET) {
      return blob ? { upload, storage: 'database' } : null;
    }
    const path = this.resolveLocalPath(upload);
    if (!path || !existsSync(path)) {
      return null;
    }
    return { upload, storage: 'local', path };
  }

  /**
   * The stored bytes of a READY, not-deleted upload, from whichever store holds it (database blob,
   * local file or seed asset); null when the upload is not ready, deleted, unknown or its bytes
   * are gone. Does not check who may read it: callers decide that.
   */
  async readBytes(uploadOrId: string | Pick<Upload, 'id'>): Promise<Buffer | null> {
    const id = typeof uploadOrId === 'string' ? uploadOrId : uploadOrId.id;
    if (!UUID_PATTERN.test(id)) {
      return null;
    }
    const upload = await this.prisma.upload.findUnique({ where: { id }, include: { blob: true } });
    if (!upload || upload.deletedAt || upload.status !== UploadStatus.READY) {
      return null;
    }
    if (upload.bucket === DATABASE_BUCKET) {
      return upload.blob ? toBuffer(upload.blob.data) : null;
    }
    const path = this.resolveLocalPath(upload);
    if (!path) {
      return null;
    }
    try {
      return await readFile(path);
    } catch (err) {
      // A file that did not survive a redeploy is "no bytes"; anything else is worth a look.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not read stored file ${upload.objectKey}: ${(err as Error).message}`);
      }
      return null;
    }
  }

  /**
   * Whether anything other than the given visualization jobs refers to the upload, so deleting it
   * would break a profile, a design, a conversation or another job.
   */
  async isReferencedElsewhere(uploadId: string, ignoreVisualizationJobIds: string[] = []): Promise<boolean> {
    const counts = await Promise.all([
      this.prisma.user.count({ where: { avatarUploadId: uploadId } }),
      // A deleted design no longer uses its pictures (nobody can open them through it).
      this.prisma.design.count({
        where: { deletedAt: null, OR: [{ thumbnailUploadId: uploadId }, { previewUploadId: uploadId }] },
      }),
      this.prisma.design.count({ where: { deletedAt: null, OR: designPictureReferences(uploadId) } }),
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

  /**
   * The owner removes a file of theirs that nothing uses (e.g. a try-on selfie whose job was
   * refused, PRD 7.2). A file a message, design, profile or job still uses stays (409).
   */
  async removeOwn(uploadId: string, userId: string): Promise<{ ok: true }> {
    const upload = await this.prisma.upload.findFirst({
      where: { id: uploadId, ownerUserId: userId, deletedAt: null },
      select: { id: true, bucket: true, objectKey: true },
    });
    if (!upload) {
      throw new NotFoundException({ success: false, message: 'Upload not found' });
    }
    if (await this.isReferencedElsewhere(upload.id)) {
      throw new ConflictException({ success: false, message: 'This file is still in use', code: 'UPLOAD_IN_USE' });
    }
    await this.discard(upload);
    return { ok: true };
  }

  /** Withdraws an upload nobody references (e.g. a result that arrived too late): row and bytes. */
  async discard(upload: Pick<Upload, 'id' | 'bucket' | 'objectKey'>): Promise<void> {
    const markDeleted = this.prisma.upload.update({
      where: { id: upload.id },
      data: { status: UploadStatus.DELETED, deletedAt: new Date() },
    });
    if (upload.bucket === DATABASE_BUCKET) {
      // Row and bytes go together.
      await this.prisma.$transaction([markDeleted, this.prisma.uploadBlob.deleteMany({ where: { uploadId: upload.id } })]);
      return;
    }
    await markDeleted;
    void this.deleteStoredFile(upload);
  }

  /**
   * Removes the stored bytes of an upload: its database blob, or its local file (seed assets are
   * shared and never removed). Callable without await: failures are logged and the returned
   * promise always resolves. Local files are removed before it returns.
   */
  deleteStoredFile(upload: Pick<Upload, 'bucket' | 'objectKey'> & { id?: string }): Promise<void> {
    if (upload.bucket === DATABASE_BUCKET) {
      return this.deleteBlob(upload);
    }
    if (!upload.objectKey.startsWith('local/')) {
      return Promise.resolve();
    }
    const path = this.resolveLocalPath(upload);
    if (path) {
      try {
        rmSync(path, { force: true });
      } catch (err) {
        this.logger.warn(`Could not delete stored file ${upload.objectKey}: ${(err as Error).message}`);
      }
    }
    return Promise.resolve();
  }

  private async deleteBlob(upload: Pick<Upload, 'bucket' | 'objectKey'> & { id?: string }): Promise<void> {
    try {
      await this.prisma.uploadBlob.deleteMany({
        where: upload.id
          ? { uploadId: upload.id }
          : { upload: { bucket: upload.bucket, objectKey: upload.objectKey } },
      });
    } catch (err) {
      this.logger.warn(`Could not delete stored bytes of ${upload.objectKey}: ${(err as Error).message}`);
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
