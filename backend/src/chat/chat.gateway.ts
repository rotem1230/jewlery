import { Logger, OnModuleDestroy } from '@nestjs/common';
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
import { isCurrentSession } from '../auth/session-validity';
import { SessionEvents } from '../common/session-events/session-events.service';
import { PrismaService } from '../database/prisma.service';
import { isAllowedSocketOrigin } from './socket-cors';

/** setTimeout cannot wait longer than this (~24.8 days); a longer delay fires immediately. */
const MAX_TIMER_MS = 2_147_483_647;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

type AuthedSocketData = {
  userId?: string;
  /** Session version of the token the socket was opened with. */
  sessionVersion?: number;
  authPromise?: Promise<string>;
  expiryTimer?: NodeJS.Timeout;
};

/**
 * Real-time chat transport. HTTP endpoints on ConversationsController remain the
 * source of truth for persistence; this gateway only handles socket auth, room
 * membership, and broadcasting `message:new` / `message:read` events emitted by
 * ConversationsService after a successful write.
 *
 * Authentication: the access token must be sent in the handshake `auth.token` (never the query
 * string, which ends up in proxy logs). The same issuer/audience/algorithm rules as HTTP apply,
 * unverified / suspended accounts are refused, and the socket is closed when the token expires.
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
      callback(null, isAllowedSocketOrigin(origin)),
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  private readonly stopListening: () => void;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    sessionEvents: SessionEvents,
  ) {
    // Revoked sessions (sign out everywhere, password reset, deletion) lose their sockets now,
    // not when the access token expires.
    this.stopListening = sessionEvents.onSessionsRevoked((userId) => this.disconnectUser(userId));
  }

  onModuleDestroy(): void {
    this.stopListening();
  }

  disconnectUser(userId: string): void {
    this.server?.in(userRoom(userId)).disconnectSockets(true);
  }

  /** Closes the socket when the access token expires, re-arming for expiries beyond the timer range. */
  private armExpiry(client: Socket, expiresAtMs: number): void {
    const data = client.data as AuthedSocketData;
    const msLeft = expiresAtMs - Date.now();
    if (msLeft <= 0) {
      client.emit('error', { message: 'Session expired' });
      client.disconnect(true);
      return;
    }
    data.expiryTimer = setTimeout(() => this.armExpiry(client, expiresAtMs), Math.min(msLeft, MAX_TIMER_MS));
    data.expiryTimer.unref?.();
  }

  private extractToken(client: Socket): string | null {
    const authToken = (client.handshake.auth as Record<string, unknown> | undefined)?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.replace(/^Bearer\s+/i, '');
    }
    return null;
  }

  private async authenticate(client: Socket): Promise<string> {
    const token = this.extractToken(client);
    if (!token) {
      throw new Error('Missing token');
    }
    const payload = await this.jwt.verifyAsync<JwtPayload & { exp?: number }>(token);
    const user = await this.prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new Error('Invalid or inactive user');
    }
    if (!isCurrentSession(payload, user)) {
      throw new Error('Session ended');
    }
    const data = client.data as AuthedSocketData;
    data.sessionVersion = user.sessionVersion;
    if (typeof payload.exp === 'number') {
      this.armExpiry(client, payload.exp * 1000);
    }
    await client.join(userRoom(user.id));
    data.userId = user.id;
    return user.id;
  }

  /**
   * Resolves the user id for a socket. `handleConnection` is async, so a client that emits
   * `conversation:join` immediately on `connect` can reach handlers before authentication
   * finished — join waits for the same in-flight authentication instead of re-verifying.
   */
  private resolveUserId(client: Socket): Promise<string> {
    const data = client.data as AuthedSocketData;
    if (data.userId) {
      return Promise.resolve(data.userId);
    }
    data.authPromise ??= this.authenticate(client);
    return data.authPromise;
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const userId = await this.resolveUserId(client);
      this.logger.debug(`Socket connected: ${client.id} (user ${userId})`);
    } catch (err) {
      this.logger.warn(`Socket auth failed for ${client.id}: ${(err as Error).message}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as AuthedSocketData;
    if (data.expiryTimer) {
      clearTimeout(data.expiryTimer);
    }
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
    if (!userId || typeof conversationId !== 'string' || !UUID.test(conversationId)) {
      return;
    }
    // The account may have been suspended or deleted, or its sessions ended (possibly through
    // another API instance, whose disconnect event never reaches this one), since the socket opened.
    const active = await this.prisma.user.count({
      where: {
        id: userId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        sessionVersion: (client.data as AuthedSocketData).sessionVersion ?? 0,
      },
    });
    if (active === 0) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant || participant.leftAt) {
      client.emit('error', { message: 'Not a participant of this conversation' });
      return;
    }
    await client.join(conversationRoom(conversationId));
  }

  @SubscribeMessage('conversation:leave')
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId?: string }): void {
    if (typeof data?.conversationId === 'string') {
      void client.leave(conversationRoom(data.conversationId));
    }
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.server?.to(conversationRoom(conversationId)).emit(event, payload);
  }
}
