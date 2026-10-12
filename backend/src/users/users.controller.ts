import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { ChangePasswordDto, RegisterDeviceDto, UpdateMeDto, UpdatePreferencesDto } from './dto/users.dto';
import { UsersService } from './users.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  async me(@Req() req: AuthedRequest) {
    const { passwordHash: _, ...safe } = req.user;
    return safe;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 400, description: 'avatarUploadId is not owned by the current user' })
  updateMe(@Req() req: AuthedRequest, @Body() dto: UpdateMeDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiResponse({ status: 200, description: 'Password changed; all sessions revoked' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  @ApiResponse({ status: 400, description: 'New password does not meet the password policy' })
  changePassword(@Req() req: AuthedRequest, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.id, dto);
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Upsert the current user notification and locale preferences' })
  @ApiResponse({ status: 200, description: 'Preferences saved' })
  updatePreferences(@Req() req: AuthedRequest, @Body() dto: UpdatePreferencesDto) {
    return this.usersService.upsertPreferences(req.user.id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete (deactivate) the current account' })
  @ApiResponse({ status: 200, description: 'Account deactivated; all sessions revoked' })
  deleteMe(@Req() req: AuthedRequest) {
    return this.usersService.softDelete(req.user.id);
  }

  @Post('me/devices')
  @ApiOperation({ summary: 'Register or refresh a push notification device token' })
  @ApiResponse({ status: 201, description: 'Device token registered' })
  registerDevice(@Req() req: AuthedRequest, @Body() dto: RegisterDeviceDto) {
    return this.usersService.registerDevice(req.user.id, dto);
  }

  @Delete('me/devices/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a registered device token' })
  @ApiResponse({ status: 200, description: 'Device token revoked' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  removeDevice(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.usersService.removeDevice(req.user.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a public user profile by id' })
  @ApiResponse({ status: 200, description: 'Public user profile' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        activeRole: true,
        status: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ success: false, message: 'User not found' });
    }
    return user;
  }
}
