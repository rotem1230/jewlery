import { createHmac } from 'crypto';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { UserRole } from '@prisma/client';
import { TokenService } from '../../src/auth/services/token.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { DEFAULT_PASSWORD, marketplaceScenario, registerVerified, uniqueEmail } from '../utils/factories';

function b64(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

describe('chat WebSocket gateway', () => {
  let t: TestApp;
  let baseUrl: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    const { port } = t.app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/ws`;
  });

  afterEach(() => {
    sockets.splice(0).forEach((s) => s.disconnect());
  });

  afterAll(async () => {
    await t.close();
  });

  function connect(opts: { token?: string; queryToken?: string }): Socket {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      auth: opts.token ? { token: opts.token } : undefined,
      query: opts.queryToken ? { token: opts.queryToken } : undefined,
    });
    sockets.push(socket);
    return socket;
  }

  /** Resolves 'connected' if the socket stays up for a moment, or 'rejected' when the server drops it. */
  function outcome(socket: Socket, settleMs = 700): Promise<'connected' | 'rejected'> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      socket.on('connect', () => {
        timer = setTimeout(() => resolve('connected'), settleMs);
      });
      socket.on('disconnect', () => {
        if (timer) clearTimeout(timer);
        resolve('rejected');
      });
      socket.on('connect_error', () => resolve('rejected'));
    });
  }

  it('accepts a verified user', async () => {
    const user = await registerVerified(t);
    expect(await outcome(connect({ token: user.accessToken }))).toBe('connected');
  });

  it('refuses an account that has not verified its e-mail', async () => {
    const email = uniqueEmail('pending');
    await t.http.post(`${API}/auth/register`).send({ email, password: DEFAULT_PASSWORD, roles: [UserRole.DESIGNER] }).expect(201);
    const pending = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    const { passwordHash: _ignored, ...safe } = pending;
    const tokens = await t.app.get(TokenService).issueTokens(safe);
    expect(await outcome(connect({ token: tokens.accessToken }))).toBe('rejected');
  });

  it('does not accept a token passed in the query string', async () => {
    const user = await registerVerified(t);
    expect(await outcome(connect({ queryToken: user.accessToken }))).toBe('rejected');
  });

  it('refuses a token that lacks the API issuer and audience', async () => {
    const user = await registerVerified(t);
    const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 600 }));
    const sig = createHmac('sha256', process.env.JWT_SECRET as string).update(`${head}.${body}`).digest('base64url');
    expect(await outcome(connect({ token: `${head}.${body}.${sig}` }))).toBe('rejected');
  });

  it('delivers messages to joined participants only', async () => {
    const s = await marketplaceScenario(t);
    const outsider = await registerVerified(t);

    const participant = connect({ token: s.designer.accessToken });
    const intruder = connect({ token: outsider.accessToken });
    await Promise.all([outcome(participant, 100), outcome(intruder, 100)]);

    participant.emit('conversation:join', { conversationId: s.conversation.id });
    intruder.emit('conversation:join', { conversationId: s.conversation.id });
    await new Promise((r) => setTimeout(r, 300));

    const received: string[] = [];
    const leaked: string[] = [];
    participant.on('message:new', (m: { body?: string }) => received.push(m.body ?? ''));
    intruder.on('message:new', (m: { body?: string }) => leaked.push(m.body ?? ''));

    await t.http
      .post(`${API}/conversations/${s.conversation.id}/messages`)
      .set(s.jeweler.auth)
      .send({ type: 'TEXT', body: 'hello designer' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toEqual(['hello designer']);
    expect(leaked).toEqual([]);
  });
});
