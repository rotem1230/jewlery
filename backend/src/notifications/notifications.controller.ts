import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { QueryNotificationsDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications', description: 'Newest first; includes unreadCount.' })
  list(@Query() query: QueryNotificationsDto, @Req() req: AuthedRequest) {
    return this.notifications.listForUser(req.user.id, query);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read (idempotent)' })
  markRead(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.notifications.markRead(id, req.user.id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all of my notifications as read' })
  markAllRead(@Req() req: AuthedRequest) {
    return this.notifications.markAllRead(req.user.id);
  }
}
