import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import {
  CreateConversationDto,
  CreateMessageDto,
  QueryConversationsDto,
  QueryMessagesDto,
} from './dto/chat.dto';
import { ConversationsService } from './conversations.service';

type AuthedRequest = Request & { user: User };

const WS_DESCRIPTION =
  'Real-time updates are pushed over Socket.IO at namespace `/ws`. Authenticate the handshake with a JWT bearer ' +
  'token via `auth.token` (or `?token=` query param), then emit `conversation:join` with `{ conversationId }` to ' +
  'join room `conversation:{id}`. Server broadcasts `message:new` and `message:read` events to that room.';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my conversations', description: WS_DESCRIPTION })
  findMany(@Query() query: QueryConversationsDto, @Req() req: AuthedRequest) {
    return this.conversations.findMany(req.user.id, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Find-or-create a conversation for a design + participant set',
    description: WS_DESCRIPTION,
  })
  create(@Body() dto: CreateConversationDto, @Req() req: AuthedRequest) {
    return this.conversations.findOrCreate(req.user.id, dto);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Get messages (cursor pagination, newest page first)',
    description: `${WS_DESCRIPTION} Pass \`cursor\` = oldest loaded message id to page further back in history.`,
  })
  getMessages(@Param('id') id: string, @Query() query: QueryMessagesDto, @Req() req: AuthedRequest) {
    return this.conversations.getMessages(id, req.user.id, query);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Send a message',
    description: `${WS_DESCRIPTION} Broadcasts \`message:new\` on success.`,
  })
  createMessage(@Param('id') id: string, @Body() dto: CreateMessageDto, @Req() req: AuthedRequest) {
    return this.conversations.createMessage(id, req.user.id, dto);
  }

  @Post(':id/read')
  @ApiOperation({
    summary: 'Mark conversation as read up to now',
    description: `${WS_DESCRIPTION} Broadcasts \`message:read\` on success.`,
  })
  markRead(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.conversations.markRead(id, req.user.id);
  }
}
