import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import {
  CreateCrmNoteDto,
  CreatePortfolioItemDto,
  QueryOrdersDto,
  UpdateCrmNoteDto,
  UpdatePortfolioItemDto,
  UpsertJewelerDraftDto,
} from './dto/jeweler-profile.dto';
import { JewelerProfilesService } from './jeweler-profiles.service';

type AuthedRequest = Request & { user: User };

@ApiTags('JewelerProfiles')
@Controller('jeweler-profiles')
export class JewelerProfilesController {
  constructor(private readonly jewelerProfiles: JewelerProfilesService) {}

  @ApiBearerAuth()
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.jewelerProfiles.me(req.user.id);
  }

  @ApiBearerAuth()
  @Put('draft')
  upsertDraft(@Body() dto: UpsertJewelerDraftDto, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.upsertDraft(req.user.id, dto);
  }

  @ApiBearerAuth()
  @Post('preview')
  preview(@Req() req: AuthedRequest) {
    return this.jewelerProfiles.preview(req.user.id);
  }

  @ApiBearerAuth()
  @Post('publish')
  publish(@Req() req: AuthedRequest) {
    return this.jewelerProfiles.publish(req.user);
  }

  @ApiBearerAuth()
  @Get('me/orders')
  orders(@Query() query: QueryOrdersDto, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.orders(req.user.id, query);
  }

  @ApiBearerAuth()
  @Get('me/portfolio')
  listPortfolio(@Req() req: AuthedRequest) {
    return this.jewelerProfiles.listPortfolio(req.user.id);
  }

  @ApiBearerAuth()
  @Post('me/portfolio')
  createPortfolioItem(@Body() dto: CreatePortfolioItemDto, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.createPortfolioItem(req.user.id, dto);
  }

  @ApiBearerAuth()
  @Patch('me/portfolio/:itemId')
  updatePortfolioItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePortfolioItemDto,
    @Req() req: AuthedRequest,
  ) {
    return this.jewelerProfiles.updatePortfolioItem(req.user.id, itemId, dto);
  }

  @ApiBearerAuth()
  @Delete('me/portfolio/:itemId')
  removePortfolioItem(@Param('itemId') itemId: string, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.removePortfolioItem(req.user.id, itemId);
  }

  @ApiBearerAuth()
  @Get('me/crm-notes')
  @ApiOperation({ summary: 'List my production-tracking CRM notes (requires jeweler_crm entitlement)' })
  listCrmNotes(@Req() req: AuthedRequest) {
    return this.jewelerProfiles.listCrmNotes(req.user.id);
  }

  @ApiBearerAuth()
  @Post('me/crm-notes')
  @ApiOperation({ summary: 'Create a production-tracking CRM note (requires jeweler_crm entitlement)' })
  createCrmNote(@Body() dto: CreateCrmNoteDto, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.createCrmNote(req.user.id, dto);
  }

  @ApiBearerAuth()
  @Patch('me/crm-notes/:id')
  @ApiOperation({ summary: 'Update a production-tracking CRM note (requires jeweler_crm entitlement)' })
  updateCrmNote(@Param('id') id: string, @Body() dto: UpdateCrmNoteDto, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.updateCrmNote(req.user.id, id, dto);
  }

  @Public()
  @Get(':id')
  findPublic(@Param('id') id: string) {
    return this.jewelerProfiles.findPublic(id);
  }
}
