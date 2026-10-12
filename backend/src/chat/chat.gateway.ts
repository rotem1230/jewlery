import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UserStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../database/prisma.service';

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/**
 * Real-time chat transport. HTTP endpoints on ConversationsController remain the
 * source of truth for persistence; this gateway only handles socket auth, room
 * membership, and broadcasting `message:new` / `message:read` events emitted by
 * ConversationsService after a successful write.
 */
@WebSocketGateway({ namespace: '/ws', cors: { origin: corsOrigins, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private extractToken(client: Socket): string | null {
    const authToken = (client.handshake.auth as Record<string, unknown> | undefined)?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.replace(/^Bearer\s+/i, '');
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }
    return null;
  }

  /**
   * Resolves the user id for a socket. `handleConnection` is async, so a
   * client that emits `conversation:join` immediately on `connect` can reach
   * handlers before `client.data.userId` is assigned — fall back to verifying
   * the handshake token on demand instead of dropping the join.
   */
  private async resolveUserId(client: Socket): Promise<string> {
    const cached = client.data.userId as string | undefined;
    if (cached) {
      return cached;
    }
    const token = this.extractToken(client);
    if (!token) {
      throw new Error('Missing token');
    }
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    const user = await this.prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null } });
    if (!user || user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new Error('Invalid or inactive user');
    }
    client.data.userId = user.id;
    return user.id;
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const userId = await this.resolveUserId(client);
      client.data.userId = userId;
      this.logger.debug(`Socket connected: ${client.id} (user ${userId})`);
    } catch (err) {
      this.logger.warn(`Socket auth failed for ${client.id}: ${(err as Error).message}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('conversation:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId?: string },
  ): Promise<void> {
    const conversationId = data?.conversationId;
    let userId: string | undefined;
    try {
      userId = await this.resolveUserId(client);
    } catch {
      return;
    }
    if (!userId || !conversationId) {
      return;
    }
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) {
      client.emit('error', { message: 'Not a participant of this conversation' });
      return;
    }
    await client.join(conversationRoom(conversationId));
  }

  @SubscribeMessage('conversation:leave')
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId?: string }): void {
    if (data?.conversationId) {
      void client.leave(conversationRoom(data.conversationId));
    }
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.server?.to(conversationRoom(conversationId)).emit(event, payload);
  }
}
