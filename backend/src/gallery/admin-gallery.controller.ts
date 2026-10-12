import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CreateGalleryItemDto, UpdateGalleryItemDto } from './dto/gallery.dto';
import { GalleryService } from './gallery.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin/Gallery')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/gallery')
export class AdminGalleryController {
  constructor(private readonly gallery: GalleryService) {}

  @Get()
  list() {
    return this.gallery.adminList();
  }

  @Post()
  create(@Body() dto: CreateGalleryItemDto, @Req() req: AuthedRequest) {
    return this.gallery.adminCreate(dto, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGalleryItemDto, @Req() req: AuthedRequest) {
    return this.gallery.adminUpdate(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.gallery.adminRemove(id, req.user.id);
  }
}
