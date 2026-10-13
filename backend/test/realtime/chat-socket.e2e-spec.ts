import { createHmac } from 'crypto';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { UserRole } from '@prisma/client';
import { TokenService } from '../../src/auth/services/token.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { createQuote, DEFAULT_PASSWORD, marketplaceScenario, registerVerified, uniqueEmail } from '../utils/factories';

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

  function closedWithin(socket: Socket, ms = 2_000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      socket.on('disconnect', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  it('deleting the account closes its live sockets', async () => {
    const user = await registerVerified(t);
    const socket = connect({ token: user.accessToken });
    expect(await outcome(socket, 150)).toBe('connected');
    const closed = closedWithin(socket);
    await t.http.delete(`${API}/users/me`).set(user.auth).expect(200);
    expect(await closed).toBe(true);
  });

  it('signing out everywhere closes live sockets', async () => {
    const user = await registerVerified(t);
    const socket = connect({ token: user.accessToken });
    expect(await outcome(socket, 150)).toBe('connected');
    const closed = closedWithin(socket);
    await t.http.post(`${API}/auth/revoke-all`).set(user.auth).send({}).expect(200);
    expect(await closed).toBe(true);
  });

  it('a password reset closes live sockets', async () => {
    const user = await registerVerified(t);
    const socket = connect({ token: user.accessToken });
    expect(await outcome(socket, 150)).toBe('connected');
    const closed = closedWithin(socket);
    await t.http.post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
    const token = await t.mailbox.tokenFor(user.email, 'reset');
    await t.http.post(`${API}/auth/reset-password`).send({ token, newPassword: 'N3w-Strong-Pass' }).expect(200);
    expect(await closed).toBe(true);
  });

  it('an access token issued before signing out everywhere cannot open a socket again', async () => {
    const user = await registerVerified(t);
    await t.http.post(`${API}/auth/revoke-all`).set(user.auth).send({}).expect(200);
    expect(await outcome(connect({ token: user.accessToken }))).toBe('rejected');
  });

  it('a socket whose sessions were ended on another server cannot join conversations', async () => {
    const s = await marketplaceScenario(t);
    const socket = connect({ token: s.designer.accessToken });
    expect(await outcome(socket, 150)).toBe('connected');
    // Ended through another API instance: this one got no in-process event, only the database knows.
    await t.prisma.user.update({ where: { id: s.designer.id }, data: { sessionVersion: { increment: 1 } } });

    socket.emit('conversation:join', { conversationId: s.conversation.id });
    await new Promise((r) => setTimeout(r, 300));
    const received: unknown[] = [];
    socket.on('message:new', (m: unknown) => received.push(m));
    await t.http
      .post(`${API}/conversations/${s.conversation.id}/messages`)
      .set(s.jeweler.auth)
      .send({ type: 'TEXT', body: 'still there?' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toEqual([]);
  });

  it('a suspended account cannot join a conversation and receives nothing', async () => {
    const s = await marketplaceScenario(t);
    const socket = connect({ token: s.designer.accessToken });
    expect(await outcome(socket, 150)).toBe('connected');
    await t.prisma.user.update({ where: { id: s.designer.id }, data: { status: 'SUSPENDED' } });

    socket.emit('conversation:join', { conversationId: s.conversation.id });
    await new Promise((r) => setTimeout(r, 300));
    const received: unknown[] = [];
    socket.on('message:new', (m: unknown) => received.push(m));
    await t.http
      .post(`${API}/conversations/${s.conversation.id}/messages`)
      .set(s.jeweler.auth)
      .send({ type: 'TEXT', body: 'are you there?' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toEqual([]);
  });

  it('tells the conversation when a quote changes, so nobody acts on a stale card', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    const owner = connect({ token: s.designer.accessToken });
    await outcome(owner, 100);
    owner.emit('conversation:join', { conversationId: s.conversation.id });
    await new Promise((r) => setTimeout(r, 300));

    const updates: Array<Record<string, unknown>> = [];
    owner.on('quote:updated', (update: Record<string, unknown>) => updates.push(update));
    await t.http.patch(`${API}/quotes/${quote.id}`).set(s.jeweler.auth).send({ laborCost: 900 }).expect(200);
    await t.http.post(`${API}/quotes/${quote.id}/withdraw`).set(s.jeweler.auth).send({}).expect(201);
    await new Promise((r) => setTimeout(r, 300));

    expect(updates).toEqual([
      expect.objectContaining({ quoteId: quote.id, status: 'PENDING', totalPrice: '1000', currency: 'ILS' }),
      expect.objectContaining({ quoteId: quote.id, status: 'WITHDRAWN' }),
    ]);
  });
});

describe('chat WebSocket gateway: account deletion', () => {
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

  it("tells the conversation when a jeweler's account deletion withdraws their quote", async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    const owner = io(baseUrl, { transports: ['websocket'], reconnection: false, auth: { token: s.designer.accessToken } });
    sockets.push(owner);
    await new Promise<void>((resolve) => owner.on('connect', () => resolve()));
    owner.emit('conversation:join', { conversationId: s.conversation.id });
    await new Promise((r) => setTimeout(r, 300));

    const updates: Array<Record<string, unknown>> = [];
    owner.on('quote:updated', (update: Record<string, unknown>) => updates.push(update));
    await t.http.delete(`${API}/users/me`).set(s.jeweler.auth).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(updates).toEqual([expect.objectContaining({ quoteId: quote.id, status: 'WITHDRAWN' })]);
  });
});

describe('chat WebSocket gateway with long-lived access tokens', () => {
  let t: TestApp;
  let baseUrl: string;
  let socket: Socket | undefined;

  beforeAll(async () => {
    t = await createTestApp({ env: { JWT_EXPIRES_IN: '30d' } });
    const { port } = t.app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/ws`;
  });

  afterAll(async () => {
    socket?.disconnect();
    await t.close();
  });

  it('stays connected (an expiry beyond the timer range used to fire at once)', async () => {
    const user = await registerVerified(t);
    socket = io(baseUrl, { transports: ['websocket'], reconnection: false, auth: { token: user.accessToken } });
    const state = await new Promise<string>((resolve) => {
      socket!.on('connect', () => setTimeout(() => resolve(socket!.connected ? 'connected' : 'dropped'), 700));
      socket!.on('disconnect', () => resolve('dropped'));
      socket!.on('connect_error', () => resolve('refused'));
    });
    expect(state).toBe('connected');
  });
});
