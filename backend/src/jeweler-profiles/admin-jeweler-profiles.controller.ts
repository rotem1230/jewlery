import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { AdminVerifyBadgeDto } from './dto/jeweler-profile.dto';
import { JewelerProfilesService } from './jeweler-profiles.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin/JewelerProfiles')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/jeweler-profiles')
export class AdminJewelerProfilesController {
  constructor(private readonly jewelerProfiles: JewelerProfilesService) {}

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.adminApprove(id, req.user.id);
  }

  @Post(':id/verify-badge')
  verifyBadge(@Param('id') id: string, @Body() dto: AdminVerifyBadgeDto, @Req() req: AuthedRequest) {
    return this.jewelerProfiles.adminSetVerifiedBadge(id, dto.verified, req.user.id);
  }
}
