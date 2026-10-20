import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContentPageStatus } from '@prisma/client';
import { Public } from '../authorization/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';

/** Pages whose Hebrew text is the binding one: shown in Hebrew to every language that has none. */
const BINDING_IN_HEBREW = new Set(['tos']);
const FALLBACK_LOCALE = 'he';

@ApiTags('Content')
@Controller('content')
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string, @Query('locale') locale = 'he') {
    const published = (pageLocale: string) =>
      this.prisma.contentPage.findFirst({
        where: { slug, locale: pageLocale, status: ContentPageStatus.PUBLISHED },
        orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
      });
    // The terms are shown in Hebrew to a language without its own; other pages are not (the app
    // shows its own text in that language instead).
    const page =
      (await published(locale)) ??
      (BINDING_IN_HEBREW.has(slug) && locale !== FALLBACK_LOCALE ? await published(FALLBACK_LOCALE) : null);

    if (!page) {
      throw new NotFoundException({
        success: false,
        message: `No published content found for slug "${slug}"`,
      });
    }

    return page;
  }
}
