import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { JwtPayload } from '../auth/interfaces/auth-user.interface';
import { Public } from '../authorization/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { ConfirmUploadDto, CreatePresignDto } from './dto/upload.dto';
import { UploadAccessService } from './upload-access.service';
import { UploadsService } from './uploads.service';

type AuthedRequest = Request & { user: User };

const INLINE_PREFIXES = ['image/', 'audio/', 'video/'];

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly access: UploadAccessService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('presign')
  presign(@Body() dto: CreatePresignDto, @Req() req: AuthedRequest) {
    return this.uploads.createPresign(req.user.id, dto.mimeType, dto.sizeBytes, dto.checksumSha256);
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
  @Get(':id/content')
  @ApiOperation({ summary: 'Download upload content (public asset, signed URL, or authorized bearer token)' })
  async content(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Query('exp') exp: unknown,
    @Query('sig') sig: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const notFound = () => new NotFoundException({ success: false, message: 'Upload content not found' });
    const servable = await this.uploads.findServable(id);
    if (!servable) {
      throw notFound();
    }
    const { upload, path } = servable;

    let visibility: 'public' | 'private' | null = null;
    if (await this.access.isPublic(upload)) {
      visibility = 'public';
    } else if (exp !== undefined && this.access.hasValidSignature(id, exp, sig)) {
      visibility = 'private';
    } else if (authorization) {
      const user = await this.authenticate(authorization);
      if (user && (await this.access.canRead(upload, user))) {
        visibility = 'private';
      }
    }
    if (!visibility) {
      throw notFound();
    }

    res.setHeader('Content-Type', upload.mimeType);
    const inline = INLINE_PREFIXES.some((prefix) => upload.mimeType.startsWith(prefix));
    res.setHeader('Content-Disposition', inline ? 'inline' : `attachment; filename="${upload.id}"`);
    if (visibility === 'public') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    res.sendFile(path);
  }

  private async authenticate(authorization: string): Promise<User | null> {
    const token = authorization.replace(/^Bearer\s+/i, '');
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      return await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, status: UserStatus.ACTIVE },
      });
    } catch {
      return null;
    }
  }
}
