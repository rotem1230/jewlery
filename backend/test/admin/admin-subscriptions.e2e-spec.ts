import { randomUUID } from 'crypto';
import { LeadStatus, SubscriptionStatus, UserRole } from '@prisma/client';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The pricing table's "leads: counting, quotas and plan validity": the admin sees every plan with
 * when it ends and the leads used and left this period, and can extend a plan, add leads or end it.
 */
describe('subscriptions and leads for the admin', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function admin(): Promise<TestUser> {
    const user = await registerVerified(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { roles: [UserRole.DESIGNER, UserRole.ADMIN] } });
    return user;
  }

  /** A live plan of the user, as the payment or the sign-up left it, with the period's leads. */
  async function planFor(
    user: TestUser,
    code: string,
    opts: { status?: SubscriptionStatus; startedDaysAgo?: number; endsIn?: number; card?: boolean } = {},
  ) {
    const plan = await t.prisma.planCatalog.findUniqueOrThrow({ where: { code } });
    const now = Date.now();
    const start = new Date(now - (opts.startedDaysAgo ?? 10) * DAY_MS);
    const end = new Date(now + (opts.endsIn ?? 30 * DAY_MS));
    const status = opts.status ?? SubscriptionStatus.ACTIVE;
    const sub = await t.prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        role: plan.role,
        status,
        billingCycle: plan.billingCycle,
        price: plan.price,
        currency: plan.currency,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        trialEndsAt: status === SubscriptionStatus.TRIALING ? end : null,
      },
    });
    if (plan.leadQuota > 0) {
      await t.prisma.lead.createMany({
        data: Array.from({ length: plan.leadQuota }, () => ({ subscriptionId: sub.id, periodStart: start, periodEnd: end })),
      });
    }
    if (opts.card) {
      const method = await t.prisma.paymentMethod.create({
        data: { userId: user.id, provider: 'cardcom', token: `tok-${sub.id}`, cardExpiry: '1230', cardLast4: '4580' },
      });
      await t.prisma.subscription.update({ where: { id: sub.id }, data: { paymentMethodId: method.id } });
    }
    return sub;
  }

  async function useLeads(subscriptionId: string, consumed: number, reserved = 0) {
    const leads = await t.prisma.lead.findMany({ where: { subscriptionId, status: LeadStatus.AVAILABLE }, take: consumed + reserved });
    for (const [i, lead] of leads.entries()) {
      await t.prisma.lead.update({
        where: { id: lead.id },
        data: i < consumed ? { status: LeadStatus.CONSUMED, consumedAt: new Date() } : { status: LeadStatus.RESERVED, reservedAt: new Date() },
      });
    }
  }

  const list = (boss: TestUser, query: Record<string, string>) => t.http.get(`${API}/admin/subscriptions`).query(query).set(boss.auth);
  const act = (boss: TestUser, id: string, action: 'extend' | 'leads' | 'cancel', body: Record<string, unknown>) =>
    t.http.post(`${API}/admin/subscriptions/${id}/${action}`).set(boss.auth).send(body);

  describe('the list', () => {
    it("shows each plan's validity and, for a jeweler, the leads used and left this period", async () => {
      const boss = await admin();
      const jeweler = await registerVerified(t, { roles: [UserRole.JEWELER] });
      const sub = await planFor(jeweler, 'JEWELER_BASIC_QUARTERLY');
      await useLeads(sub.id, 3, 1);
      // A lead of a period that is over counts no more.
      await t.prisma.lead.create({
        data: { subscriptionId: sub.id, status: LeadStatus.CONSUMED, periodStart: new Date(Date.now() - 100 * DAY_MS), periodEnd: new Date(Date.now() - 10 * DAY_MS) },
      });

      const res = await list(boss, { q: jeweler.email }).expect(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0]).toMatchObject({
        id: sub.id,
        user: { id: jeweler.id, email: jeweler.email },
        role: 'JEWELER',
        plan: { code: 'JEWELER_BASIC_QUARTERLY' },
        status: 'ACTIVE',
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: false,
        hasCard: false,
        leads: { quota: 10, total: 10, used: 3, reserved: 1, available: 6 },
      });

      const designer = await registerVerified(t);
      await planFor(designer, 'DESIGNER_PREMIUM_ANNUAL', { status: SubscriptionStatus.TRIALING, endsIn: 5 * DAY_MS });
      const trial = (await list(boss, { q: designer.email }).expect(200)).body.data.items[0];
      expect(trial).toMatchObject({ role: 'DESIGNER', status: 'TRIALING', plan: { code: 'DESIGNER_PREMIUM_ANNUAL' }, leads: null });
      expect(new Date(trial.trialEndsAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('filters by role and status: live plans by default, ended ones on request', async () => {
      const boss = await admin();
      const jeweler = await registerVerified(t, { roles: [UserRole.JEWELER] });
      await planFor(jeweler, 'JEWELER_PROFESSIONAL', { status: SubscriptionStatus.EXPIRED, endsIn: -5 * DAY_MS, startedDaysAgo: 100 });

      expect((await list(boss, { q: jeweler.email }).expect(200)).body.data.total).toBe(0);
      const ended = (await list(boss, { q: jeweler.email, status: 'all' }).expect(200)).body.data;
      expect(ended.items.map((row: { status: string }) => row.status)).toEqual(['EXPIRED']);
      expect((await list(boss, { q: jeweler.email, status: 'all', role: 'DESIGNER' }).expect(200)).body.data.total).toBe(0);
      await list(boss, { status: 'NOPE' }).expect(400);
      await list(boss, { pageSize: '500' }).expect(400);
    });

    it('is for admins only', async () => {
      const user = await registerVerified(t);
      await t.http.get(`${API}/admin/subscriptions`).set(user.auth).expect(403);
      await t.http.post(`${API}/admin/subscriptions/00000000-0000-0000-0000-000000000000/extend`).set(user.auth).send({ days: 1, reason: 'x' }).expect(403);
    });
  });

  describe('extending a plan', () => {
    it("moves the period end and this period's leads together, once per request", async () => {
      const boss = await admin();
      const jeweler = await registerVerified(t, { roles: [UserRole.JEWELER] });
      const sub = await planFor(jeweler, 'JEWELER_BUSINESS');
      await useLeads(sub.id, 2);
      const end = sub.currentPeriodEnd.getTime();
      const requestId = randomUUID();

      const res = await act(boss, sub.id, 'extend', { days: 30, reason: 'פיצוי על תקלה', requestId }).expect(201);
      expect(new Date(res.body.data.currentPeriodEnd).getTime()).toBe(end + 30 * DAY_MS);
      expect(res.body.data.leads).toMatchObject({ total: 20, used: 2, available: 18 });
      const leads = await t.prisma.lead.findMany({ where: { subscriptionId: sub.id } });
      expect(leads.every((lead) => lead.periodEnd.getTime() === end + 30 * DAY_MS)).toBe(true);

      // The same request again (a double tap, a retry) extends once.
      await act(boss, sub.id, 'extend', { days: 30, reason: 'פיצוי על תקלה', requestId }).expect(201);
      const after = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(after.currentPeriodEnd.getTime()).toBe(end + 30 * DAY_MS);

      const audit = await t.prisma.auditLog.findMany({ where: { entityId: sub.id, action: 'subscription.extended' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorUserId: boss.id, entityType: 'Subscription' });
    });

    it('a trial is extended with its end', async () => {
      const boss = await admin();
      const designer = await registerVerified(t);
      const sub = await planFor(designer, 'DESIGNER_PREMIUM_QUARTERLY', { status: SubscriptionStatus.TRIALING, endsIn: 3 * DAY_MS });
      await act(boss, sub.id, 'extend', { days: 7, reason: 'עוד זמן להתנסות' }).expect(201);
      const after = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(after.trialEndsAt?.getTime()).toBe(sub.currentPeriodEnd.getTime() + 7 * DAY_MS);
      expect(after.currentPeriodEnd.getTime()).toBe(sub.currentPeriodEnd.getTime() + 7 * DAY_MS);
    });

    it('refuses a paid plan whose renewal charge is under way, an ended plan and bad input', async () => {
      const boss = await admin();
      const designer = await registerVerified(t);
      // Renewals are charged in the last 12 hours, keyed by the period end: moving it then could charge twice.
      const renewing = await planFor(designer, 'DESIGNER_PREMIUM_QUARTERLY', { endsIn: 6 * HOUR_MS, card: true });
      expect((await act(boss, renewing.id, 'extend', { days: 7, reason: 'x' }).expect(409)).body.code).toBe('RENEWAL_IN_PROGRESS');

      const other = await registerVerified(t);
      const ended = await planFor(other, 'DESIGNER_PREMIUM_QUARTERLY', { status: SubscriptionStatus.CANCELLED, endsIn: -DAY_MS });
      expect((await act(boss, ended.id, 'extend', { days: 7, reason: 'x' }).expect(409)).body.code).toBe('SUBSCRIPTION_NOT_LIVE');

      await act(boss, renewing.id, 'extend', { days: 0, reason: 'x' }).expect(400);
      await act(boss, renewing.id, 'extend', { days: 400, reason: 'x' }).expect(400);
      await act(boss, renewing.id, 'extend', { days: 7 }).expect(400);
      await act(boss, '00000000-0000-0000-0000-000000000000', 'extend', { days: 7, reason: 'x' }).expect(404);
    });
  });

  describe('adding leads', () => {
    it('adds leads usable until the end of this period, once per request', async () => {
      const boss = await admin();
      const jeweler = await registerVerified(t, { roles: [UserRole.JEWELER] });
      const sub = await planFor(jeweler, 'JEWELER_TRIAL');
      await useLeads(sub.id, 3);
      const requestId = randomUUID();

      const res = await act(boss, sub.id, 'leads', { count: 5, reason: 'מבצע השקה', requestId }).expect(201);
      expect(res.body.data.leads).toMatchObject({ quota: 3, total: 8, used: 3, available: 5 });
      await act(boss, sub.id, 'leads', { count: 5, reason: 'מבצע השקה', requestId }).expect(201);
      const added = await t.prisma.lead.findMany({ where: { subscriptionId: sub.id, status: LeadStatus.AVAILABLE } });
      expect(added).toHaveLength(5);
      for (const lead of added) {
        expect(lead.periodStart.getTime()).toBeLessThanOrEqual(Date.now());
        expect(lead.periodEnd.getTime()).toBe(sub.currentPeriodEnd.getTime());
      }
      expect(await t.prisma.auditLog.count({ where: { entityId: sub.id, action: 'subscription.leads_added' } })).toBe(1);
    });

    it("refuses a designer's plan, an ended plan and bad counts", async () => {
      const boss = await admin();
      const designer = await registerVerified(t);
      const sub = await planFor(designer, 'DESIGNER_PREMIUM_ANNUAL');
      expect((await act(boss, sub.id, 'leads', { count: 2, reason: 'x' }).expect(409)).body.code).toBe('LEADS_NOT_APPLICABLE');

      const jeweler = await registerVerified(t, { roles: [UserRole.JEWELER] });
      const ended = await planFor(jeweler, 'JEWELER_BASIC_QUARTERLY', { status: SubscriptionStatus.EXPIRED, endsIn: -DAY_MS });
      expect((await act(boss, ended.id, 'leads', { count: 2, reason: 'x' }).expect(409)).body.code).toBe('SUBSCRIPTION_NOT_LIVE');
      await act(boss, ended.id, 'leads', { count: 0, reason: 'x' }).expect(400);
      await act(boss, ended.id, 'leads', { count: 101, reason: 'x' }).expect(400);
    });
  });

  describe('ending a plan', () => {
    it('at the end of the period: access continues, nothing renews, a scheduled switch is withdrawn', async () => {
      const boss = await admin();
      const designer = await registerVerified(t);
      const sub = await planFor(designer, 'DESIGNER_PREMIUM_QUARTERLY', { card: true });
      const annual = await t.prisma.planCatalog.findUniqueOrThrow({ where: { code: 'DESIGNER_PREMIUM_ANNUAL' } });
      await t.prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlanId: annual.id } });

      const res = await act(boss, sub.id, 'cancel', { immediately: false, reason: 'ביקש בטלפון' }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true, pendingPlan: null });
      const me = await t.http.get(`${API}/subscriptions/me`).set(designer.auth).expect(200);
      expect(me.body.data).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true });
      expect(await t.prisma.outboxEvent.count({ where: { type: 'subscription.cancelled', payload: { path: ['subscriptionId'], equals: sub.id } } })).toBe(1);
    });

    it('at once: the plan and what it includes end now', async () => {
      const boss = await admin();
      const jeweler = await registerVerified(t, { roles: [UserRole.JEWELER] });
      const sub = await planFor(jeweler, 'JEWELER_PROFESSIONAL');
      const res = await act(boss, sub.id, 'cancel', { immediately: true, reason: 'הונאה' }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'CANCELLED', cancelAtPeriodEnd: true });
      const me = await t.http.get(`${API}/subscriptions/me`).set(jeweler.auth).expect(200);
      expect(me.body.data).toBeNull();
      expect((await act(boss, sub.id, 'cancel', { immediately: true, reason: 'שוב' }).expect(409)).body.code).toBe('SUBSCRIPTION_NOT_LIVE');
      await act(boss, sub.id, 'cancel', { immediately: true }).expect(400);
    });
  });
});
