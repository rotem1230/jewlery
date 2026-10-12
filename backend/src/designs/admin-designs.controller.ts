import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { AdminFeasibilityDto } from './dto/design.dto';
import { DesignsService } from './designs.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin/Designs')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/designs')
export class AdminDesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Post(':id/feasibility')
  reviewFeasibility(@Param('id') id: string, @Body() dto: AdminFeasibilityDto, @Req() req: AuthedRequest) {
    return this.designs.adminReviewFeasibility(id, req.user.id, dto.status, dto.note);
  }
}
