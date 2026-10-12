import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContentPageStatus, Prisma, User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { PrismaService } from '../database/prisma.service';
import { AppConfigService } from './app-config.service';
import { CreateContentPageDto, UpdateContentPageDto } from './dto/content-page.dto';
import { UpsertAppConfigDto } from './dto/app-config.dto';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin/Config', 'Admin/Content')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminCmsController {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('config')
  listConfig() {
    return this.appConfig.getAll();
  }

  @Get('config/:key')
  async getConfig(@Param('key') key: string) {
    const value = await this.appConfig.get(key);
    if (value === undefined) {
      throw new NotFoundException({ success: false, message: `Config key "${key}" not found` });
    }
    return { key, value };
  }

  @Put('config/:key')
  setConfig(
    @Param('key') key: string,
    @Body() dto: UpsertAppConfigDto,
    @Req() req: AuthedRequest,
  ) {
    return this.appConfig.set(key, dto.value as Prisma.InputJsonValue, req.user.id);
  }

  @Get('content')
  listContent() {
    return this.prisma.contentPage.findMany({ orderBy: [{ slug: 'asc' }, { locale: 'asc' }, { version: 'desc' }] });
  }

  @Get('content/:id')
  async getContent(@Param('id') id: string) {
    const page = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!page) {
      throw new NotFoundException({ success: false, message: 'Content page not found' });
    }
    return page;
  }

  @Post('content')
  createContent(@Body() dto: CreateContentPageDto) {
    return this.prisma.contentPage.create({
      data: {
        slug: dto.slug,
        locale: dto.locale ?? 'he',
        title: dto.title,
        body: dto.body as Prisma.InputJsonValue,
        status: ContentPageStatus.DRAFT,
      },
    });
  }

  @Put('content/:id')
  async updateContent(@Param('id') id: string, @Body() dto: UpdateContentPageDto) {
    const existing = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ success: false, message: 'Content page not found' });
    }
    return this.prisma.contentPage.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body as Prisma.InputJsonValue | undefined,
        status: dto.status,
      },
    });
  }

  @Post('content/:id/publish')
  async publishContent(@Param('id') id: string) {
    const existing = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ success: false, message: 'Content page not found' });
    }
    return this.prisma.contentPage.update({
      where: { id },
      data: { status: ContentPageStatus.PUBLISHED, publishedAt: new Date() },
    });
  }
}
