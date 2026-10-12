import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { PromotionsService } from './promotions.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin/Promotions')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list() {
    return this.promotions.adminList();
  }

  @Post()
  create(@Body() dto: CreatePromotionDto, @Req() req: AuthedRequest) {
    return this.promotions.adminCreate(dto, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto, @Req() req: AuthedRequest) {
    return this.promotions.adminUpdate(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.promotions.adminRemove(id, req.user.id);
  }
}
