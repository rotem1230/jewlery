import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { JwtPayload } from '../auth/interfaces/auth-user.interface';
import { isCurrentSession } from '../auth/session-validity';
import { Public } from '../authorization/decorators/public.decorator';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { PrismaService } from '../database/prisma.service';
import { ConfirmUploadDto, CreatePresignDto } from './dto/upload.dto';
import { sendBytes } from './send-bytes';
import { UploadAccessService } from './upload-access.service';
import { MediaTrafficService } from './media-traffic.service';
import { UploadsService } from './uploads.service';

type AuthedRequest = Request & { user: User };

const INLINE_PREFIXES = ['image/', 'audio/', 'video/'];
/** Players seek in these with byte ranges (voice notes, videos); images are always sent whole. */
const RANGE_PREFIXES = ['audio/', 'video/'];

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly access: UploadAccessService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiterService,
    private readonly config: ConfigService,
    private readonly traffic: MediaTrafficService,
  ) {}

  @Post('presign')
  presign(@Body() dto: CreatePresignDto, @Req() req: AuthedRequest) {
    return this.uploads.createPresign(req.user.id, dto.mimeType, dto.sizeBytes, dto.checksumSha256);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an upload of mine that nothing uses (409 UPLOAD_IN_USE otherwise)' })
  remove(@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string, @Req() req: AuthedRequest) {
    return this.uploads.removeOwn(id, req.user.id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() _dto: ConfirmUploadDto, @Req() req: AuthedRequest) {
    return this.uploads.confirm(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Upload a file (max 10MB). Returns the upload row and a signed contentUrl.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_485_760, files: 1, fields: 10 } }))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: AuthedRequest) {
    if (!file) {
      throw new BadRequestException({ success: false, message: 'A file is required (multipart field "file")' });
    }
    return this.uploads.createLocal(req.user.id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalname: file.originalname,
    });
  }

  /**
   * Serves stored bytes. Public assets are served to anyone; private media needs a valid signed
   * URL (issued in API responses to authorized callers) or the bearer token of the owner, a
   * conversation participant or an admin. Every refusal is a 404 so existence is not revealed.
   */
  @Public()
  @SkipThrottle()
  @Get(':id/content')
  @ApiOperation({ summary: 'Download upload content (public asset, signed URL, or authorized bearer token)' })
  async content(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Query('exp') exp: unknown,
    @Query('sig') sig: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Ip() clientIp: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Media has its own budget: a screen full of images must not lock the client out of the API.
    const allowed = await this.limiter.consume(
      `media:${clientIp}`,
      this.config.get<number>('throttle.mediaLimit', 600),
      this.config.get<number>('throttle.ttlMs', 60_000),
    );
    if (!allowed) {
      throw new HttpException({ success: false, message: 'Too many requests' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const notFound = () => new NotFoundException({ success: false, message: 'Upload content not found' });
    const servable = await this.uploads.findServable(id);
    if (!servable) {
      throw notFound();
    }
    const { upload } = servable;

    let visibility: 'public' | 'signed' | 'private' | null = null;
    if (await this.access.isPublic(upload)) {
      visibility = 'public';
    } else if (exp !== undefined && this.access.hasValidSignature(id, exp, sig)) {
      visibility = 'signed';
    } else if (authorization) {
      const user = await this.authenticate(authorization);
      if (user && (await this.access.canRead(upload, user))) {
        visibility = 'private';
      }
    }
    if (!visibility) {
      throw notFound();
    }
    // Blob bytes are loaded only once access is granted, and before any header is set (a refusal
    // must still go out as a JSON error).
    const bytes = servable.storage === 'database' ? await this.uploads.readBytes(upload) : null;
    if (servable.storage === 'database' && !bytes) {
      throw notFound();
    }

    // Traffic of the files' owner (for the cost reports), counted once the response is sent.
    res.on('finish', () => {
      if (res.statusCode === 200 || res.statusCode === 206) {
        void this.traffic.record(upload.ownerUserId, Number(res.getHeader('Content-Length') ?? 0));
      }
    });
    res.setHeader('Content-Type', upload.mimeType);
    const inline = INLINE_PREFIXES.some((prefix) => upload.mimeType.startsWith(prefix));
    res.setHeader('Content-Disposition', inline ? 'inline' : `attachment; filename="${upload.id}"`);
    if (visibility === 'public') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    // Public assets and signed links (the signature is the authorization) may be embedded by the web
    // app on another origin; bearer-authorized responses keep helmet's same-origin policy.
    if (visibility !== 'private') {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    if (servable.storage === 'local') {
      // Files on disk (legacy uploads, seed assets): send handles ETag, ranges and errors.
      res.sendFile(servable.path);
      return;
    }
    if (bytes) {
      sendBytes(req, res, bytes, {
        etag: `"${upload.id}"`,
        ranges: RANGE_PREFIXES.some((prefix) => upload.mimeType.startsWith(prefix)),
      });
    }
  }

  private async authenticate(authorization: string): Promise<User | null> {
    const token = authorization.replace(/^Bearer\s+/i, '');
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, status: UserStatus.ACTIVE },
      });
      // A token from sessions that were ended (sign out everywhere, password change...) opens nothing.
      return user && isCurrentSession(payload, user) ? user : null;
    } catch {
      return null;
    }
  }
}
