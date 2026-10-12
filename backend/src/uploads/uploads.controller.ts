import { Body, Controller, Get, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { ConfirmUploadDto, CreatePresignDto } from './dto/upload.dto';
import { UploadsService } from './uploads.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('presign')
  presign(@Body() dto: CreatePresignDto, @Req() req: AuthedRequest) {
    return this.uploads.createPresign(
      req.user.id,
      dto.mimeType,
      dto.sizeBytes,
      dto.checksumSha256,
    );
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() _dto: ConfirmUploadDto, @Req() req: AuthedRequest) {
    return this.uploads.confirm(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Upload a file directly (dev local storage, max 10MB)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_485_760 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: AuthedRequest) {
    return this.uploads.createLocal(req.user.id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalname: file.originalname,
    });
  }

  @Public()
  @Get(':id/content')
  @ApiOperation({ summary: 'Serve seeded showcase bytes (dev only; UUID-addressed)' })
  async content(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const file = await this.uploads.getSeedContent(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(file.path);
  }
}
