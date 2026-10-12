import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, normalize, sep } from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Upload, UploadStatus } from '@prisma/client';
import { AppConfigService } from '../cms/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_UPLOAD_LIMITS, UploadLimits } from './uploads.constants';

export type PresignResult = {
  uploadId: string;
  uploadUrl: string;
  objectKey: string;
  bucket: string;
  expiresInSeconds: number;
};

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
  ) {}

  private async getLimits(): Promise<UploadLimits> {
    const configured = await this.appConfig.get('upload_limits');
    if (
      configured &&
      typeof configured === 'object' &&
      !Array.isArray(configured) &&
      'maxBytes' in configured &&
      'allowedMimeTypes' in configured
    ) {
      return configured as unknown as UploadLimits;
    }
    return DEFAULT_UPLOAD_LIMITS;
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

  async createPresign(
    ownerUserId: string,
    mimeType: string,
    sizeBytes: number,
    checksumSha256?: string,
  ): Promise<PresignResult> {
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
   * Direct local upload (dev): persists a multipart file under
   * `uploads-local/` and returns a READY upload row. Validated against the
   * same `upload_limits` AppConfig as presigned uploads.
   */
  async createLocal(
    ownerUserId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ): Promise<Upload> {
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

    const dir = join(process.cwd(), 'uploads-local');
    mkdirSync(dir, { recursive: true });
    // Server-generated name only — never user input (traversal-safe).
    const filename = `${randomUUID()}.${this.extensionFor(file.mimetype)}`;
    writeFileSync(join(dir, filename), file.buffer);

    return this.prisma.upload.create({
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
  }

  /** Server-written file (AI / render output). Skips the chat MIME allowlist. */
  async createGeneratedLocal(ownerUserId: string, bytes: Buffer, mimeType: string): Promise<Upload> {
    const dir = join(process.cwd(), 'uploads-local');
    mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}.${this.extensionFor(mimeType)}`;
    writeFileSync(join(dir, filename), bytes);
    return this.prisma.upload.create({
      data: {
        ownerUserId,
        bucket: 'local-dev',
        objectKey: `local/${filename}`,
        mimeType,
        sizeBytes: bytes.length,
        status: UploadStatus.READY,
        readyAt: new Date(),
      },
    });
  }

  private localBaseDirs(): { seedDir: string; localDir: string } {
    return {
      seedDir: join(__dirname, '..', '..', 'seed-assets'),
      localDir: join(process.cwd(), 'uploads-local'),
    };
  }

  /**
   * Local file serving for dev uploads (`local-dev` bucket only):
   * `seed/*` keys resolve under `seed-assets/`, chat uploads under
   * `uploads-local/`. Real (S3) uploads stay behind the presigned flow —
   * traversal-safe via normalized prefix checks.
   */
  async getSeedContent(uploadId: string): Promise<{ path: string; mimeType: string }> {
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload || upload.bucket !== 'local-dev') {
      throw new NotFoundException({ success: false, message: 'Upload content not found' });
    }
    const { seedDir, localDir } = this.localBaseDirs();
    let resolved: string;
    if (upload.objectKey.startsWith('seed/')) {
      resolved = normalize(join(seedDir, upload.objectKey.slice('seed/'.length)));
      if (!resolved.startsWith(seedDir + sep)) {
        throw new NotFoundException({ success: false, message: 'Upload content not found' });
      }
    } else if (upload.objectKey.startsWith('local/')) {
      resolved = normalize(join(localDir, upload.objectKey.slice('local/'.length)));
      if (!resolved.startsWith(localDir + sep)) {
        throw new NotFoundException({ success: false, message: 'Upload content not found' });
      }
    } else {
      throw new NotFoundException({ success: false, message: 'Upload content not found' });
    }
    if (!existsSync(resolved)) {
      throw new NotFoundException({ success: false, message: 'Upload content not found' });
    }
    return { path: resolved, mimeType: upload.mimeType };
  }
}
