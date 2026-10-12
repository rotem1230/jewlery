import { Logger } from '@nestjs/common';
import { OUTBOX_MAX_ATTEMPTS, OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { OutboxService } from '../../src/common/outbox/outbox.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  acceptQuote,
  createDraftDesign,
  createQuote,
  marketplaceScenario,
  registerVerified,
  VALID_RING_PARAMETERS,
} from '../utils/factories';

describe('outbox delivery', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.prisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
  });

  function poison(count: number) {
    return t.prisma.outboxEvent.createMany({
      data: Array.from({ length: count }, () => ({
        type: 'notification.push',
        payload: { userId: '00000000-0000-4000-8000-000000000000', title: 'x', body: 'y' },
      })),
    });
  }

  it('events that keep failing do not block newer events', async () => {
    const user = await registerVerified(t);
    await poison(60);
    await t.prisma.outboxEvent.create({
      data: { type: 'notification.push', payload: { userId: user.id, eventKey: 'probe.delivered', title: 't', body: 'b' } },
    });

    const processor = t.app.get(OutboxProcessor);
    for (let i = 0; i < 4; i += 1) {
      await processor.processPending();
    }
    const delivered = await t.prisma.notification.count({ where: { userId: user.id, eventKey: 'probe.delivered' } });
    expect(delivered).toBe(1);
  });

  it('dead-letters an event after the maximum attempts', async () => {
    await poison(1);
    const processor = t.app.get(OutboxProcessor);
    for (let i = 0; i < 15; i += 1) {
      await t.prisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { nextAttemptAt: new Date(0) } });
      await processor.processPending();
    }
    const dead = await t.prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'notification.push', deadAt: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    expect(dead.attempts).toBeLessThanOrEqual(10);
  });

  it('a new event is due at once, whichever clock stamped it', async () => {
    // Regression: nextAttemptAt defaulted to the insert time from Prisma's clock, which can run
    // ahead of the worker's clock, so a fresh event looked "not yet due" to the next pass.
    const user = await registerVerified(t);
    const event = await t.app.get(OutboxService).enqueue('notification.push', {
      userId: user.id,
      eventKey: 'probe.immediate',
      title: 't',
      body: 'b',
    });
    expect(event.nextAttemptAt).toBeNull();
    await t.app.get(OutboxProcessor).processPending();
    expect(await t.prisma.notification.count({ where: { userId: user.id, eventKey: 'probe.immediate' } })).toBe(1);
  });

  type Dispatch = (type: string, payload: Record<string, unknown>) => Promise<void>;

  function dispatchOf(processor: OutboxProcessor) {
    return jest.spyOn(processor as unknown as { dispatch: Dispatch }, 'dispatch');
  }

  it('claiming an event counts as an attempt, so a worker that dies mid-delivery is accounted for', async () => {
    const user = await registerVerified(t);
    const event = await t.app.get(OutboxService).enqueue('notification.push', { userId: user.id, eventKey: 'probe.claim', title: 't', body: 'b' });
    const processor = t.app.get(OutboxProcessor);
    let release!: () => void;
    const spy = dispatchOf(processor).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    try {
      const running = processor.processPending();
      for (let i = 0; i < 100 && !release; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      const claimed = await t.prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
      expect(claimed.attempts).toBe(1);
      release();
      await running;
    } finally {
      spy.mockRestore();
    }
  });

  it('an event whose attempts were used up by crashed workers is dead-lettered, not delivered again', async () => {
    const user = await registerVerified(t);
    const event = await t.prisma.outboxEvent.create({
      data: {
        type: 'notification.push',
        payload: { userId: user.id, eventKey: 'probe.crashed', title: 't', body: 'b' },
        attempts: OUTBOX_MAX_ATTEMPTS,
        lockedUntil: new Date(Date.now() - 60_000),
      },
    });
    await t.app.get(OutboxProcessor).processPending();

    expect(await t.prisma.notification.count({ where: { userId: user.id, eventKey: 'probe.crashed' } })).toBe(0);
    const stored = await t.prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.deadAt).not.toBeNull();
  });

  it('a worker whose lease expired cannot overwrite the result of the worker that took over', async () => {
    const user = await registerVerified(t);
    const event = await t.app.get(OutboxService).enqueue('notification.push', { userId: user.id, eventKey: 'probe.fenced', title: 't', body: 'b' });
    const processor = t.app.get(OutboxProcessor);
    let release!: () => void;
    const spy = dispatchOf(processor).mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (release = () => reject(new Error('slow worker failed')))),
    );
    try {
      const slow = processor.processPending();
      for (let i = 0; i < 100 && !release; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      // The slow worker's lease runs out; another worker takes the event over and delivers it.
      await t.prisma.outboxEvent.update({ where: { id: event.id }, data: { lockedUntil: new Date(Date.now() - 1_000) } });
      await processor.processPending();
      release();
      await slow;
    } finally {
      spy.mockRestore();
    }

    const stored = await t.prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.processedAt).not.toBeNull();
    expect(stored.lastError).toBeNull();
    expect(await t.prisma.notification.count({ where: { userId: user.id, eventKey: 'probe.fenced' } })).toBe(1);
  });

  it('two workers draining at once deliver every event exactly once', async () => {
    const user = await registerVerified(t);
    await t.prisma.outboxEvent.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        type: 'notification.push',
        payload: { userId: user.id, eventKey: 'probe.once', title: `t${i}`, body: 'b' },
      })),
    });
    const processor = t.app.get(OutboxProcessor);
    await Promise.all([processor.processPending(), processor.processPending()]);
    const delivered = await t.prisma.notification.count({ where: { userId: user.id, eventKey: 'probe.once' } });
    expect(delivered).toBe(20);
  });
});

describe('design editing integrity', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('simultaneous saves from the same version: exactly one wins, the rest are told they are stale', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const results = await Promise.all(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((title) =>
        t.http.patch(`${API}/designs/${design.id}`).set(owner.auth).send({ version: 1, title }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const stored = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect(stored.version).toBe(2);
  });

  it('restoring an old version cannot change a locked field', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const whiteGold = { ...VALID_RING_PARAMETERS, metal: { metalCode: 'WHITE_GOLD', purityCode: '14K' } };
    await t.http.patch(`${API}/designs/${design.id}`).set(owner.auth).send({ version: 1, parameters: whiteGold }).expect(200);
    await t.http.post(`${API}/designs/${design.id}/lock`).set(owner.auth).send({ fields: ['metal'], confirm: true }).expect(201);

    const res = await t.http.post(`${API}/designs/${design.id}/versions/1/restore`).set(owner.auth).send({}).expect(403);
    expect(res.body.code).toBe('FIELD_LOCKED');
    const stored = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect((stored.parameters as { metal: { metalCode: string } }).metal.metalCode).toBe('WHITE_GOLD');
  });

  it('locking two different fields at the same moment keeps both locked', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const lock = await lockRow(t, 'designs', design.id);
    const locking = ['metal', 'size'].map((field) =>
      t.http
        .post(`${API}/designs/${design.id}/lock`)
        .set(owner.auth)
        .send({ fields: [field], confirm: true })
        .then((res) => res),
    );
    await waitForLockWaiters(t, 2);
    await lock.release();
    expect((await Promise.all(locking)).map((r) => r.status)).toEqual([201, 201]);

    const stored = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect([...stored.lockedFields].sort()).toEqual(['metal', 'size']);
  });

  it('a design with an accepted quote can no longer be edited or rolled back', async () => {
    const s = await marketplaceScenario(t);
    const before = await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } });
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);
    const accepted = await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } });
    // An editor still holding the pre-acceptance version is told it is stale.
    expect(accepted.version).toBeGreaterThan(before.version);

    const edit = await t.http
      .patch(`${API}/designs/${s.design.id}`)
      .set(s.designer.auth)
      .send({ version: accepted.version, title: 'changed after the deal' })
      .expect(409);
    expect(edit.body.code).toBe('DESIGN_COMPLETED');
    const restore = await t.http
      .post(`${API}/designs/${s.design.id}/versions/1/restore`)
      .set(s.designer.auth)
      .send({})
      .expect(409);
    expect(restore.body.code).toBe('DESIGN_COMPLETED');
    const after = await t.prisma.design.findUniqueOrThrow({ where: { id: s.design.id } });
    expect(after.title).toBe(accepted.title);
  });

  it('validation follows an updated item-type schema (no stale validator cache)', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    const ring = await t.prisma.itemType.findUniqueOrThrow({ where: { code: 'RING' }, include: { config: true } });
    const original = ring.config!.parametersSchema as Record<string, unknown>;
    await t.http.patch(`${API}/designs/${design.id}`).set(owner.auth).send({ version: 1, parameters: VALID_RING_PARAMETERS }).expect(200);

    await t.prisma.itemTypeConfig.update({
      where: { itemTypeId: ring.id },
      data: { parametersSchema: { ...original, required: ['size', 'metal', 'finishCode'] } },
    });
    try {
      await t.http.patch(`${API}/designs/${design.id}`).set(owner.auth).send({ version: 2, parameters: VALID_RING_PARAMETERS }).expect(400);
    } finally {
      await t.prisma.itemTypeConfig.update({ where: { itemTypeId: ring.id }, data: { parametersSchema: original as object } });
    }
    await t.http.patch(`${API}/designs/${design.id}`).set(owner.auth).send({ version: 2, parameters: VALID_RING_PARAMETERS }).expect(200);
  });
});

describe('chat', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('unread counts include system messages', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
    await acceptQuote(t, s.designer, quote).expect(201);

    const res = await t.http.get(`${API}/conversations`).set(s.jeweler.auth).expect(200);
    const conv = (res.body.data.items as Array<{ id: string; unreadCount: number }>).find((c) => c.id === s.conversation.id);
    expect(conv?.unreadCount).toBe(2);
  });
});

describe('notification logging', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('never writes push device tokens to the logs', async () => {
    const user = await registerVerified(t);
    const deviceToken = 'fcm-secret-device-token-0123456789';
    await t.http.post(`${API}/users/me/devices`).set(user.auth).send({ token: deviceToken, platform: 'android' }).expect(201);

    const lines: string[] = [];
    const spies = (['log', 'debug', 'verbose', 'warn'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      }),
    );
    try {
      await t.app.get(NotificationsService).createInApp(user.id, 'probe', 'Title', 'Body');
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(lines.some((l) => l.includes(deviceToken))).toBe(false);
  });
});
