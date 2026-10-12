import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContentPageStatus } from '@prisma/client';
import { Public } from '../authorization/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';

@ApiTags('Content')
@Controller('content')
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string, @Query('locale') locale = 'he') {
    const page = await this.prisma.contentPage.findFirst({
      where: { slug, locale, status: ContentPageStatus.PUBLISHED },
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
    });

    if (!page) {
      throw new NotFoundException({
        success: false,
        message: `No published content found for slug "${slug}"`,
      });
    }

    return page;
  }
}
