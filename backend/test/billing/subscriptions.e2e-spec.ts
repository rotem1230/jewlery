import { SubscriptionLifecycleService } from '../../src/subscriptions/subscription-lifecycle.service';
import { lockRow, waitForLockWaiters } from '../utils/db-locks';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { registerVerified, TestUser } from '../utils/factories';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Regressions for the billing findings: paid plans were granted with no payment, trials never
 * ended, cancel removed paid-for access immediately, and concurrent subscribes duplicated rows.
 */
describe('subscriptions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  function subscribe(user: TestUser, planCode: string) {
    return t.http.post(`${API}/subscriptions/subscribe`).set(user.auth).send({ planCode });
  }

  async function entitlementKeys(user: TestUser): Promise<string[]> {
    const res = await t.http.get(`${API}/subscriptions/entitlements/me`).set(user.auth).expect(200);
    return res.body.data.keys;
  }

  async function paidPlanWithoutTrial(): Promise<string> {
    const code = `TEST_PAID_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await t.prisma.planCatalog.create({
      data: {
        code,
        role: 'DESIGNER',
        nameHe: 'בדיקה',
        nameEn: 'Test paid',
        billingCycle: 'MONTHLY',
        price: 10,
        currency: 'ILS',
        trialDays: 0,
        leadQuota: 0,
        inclusions: { bullets: [] },
      },
    });
    return code;
  }

  it('a free plan activates immediately', async () => {
    const designer = await registerVerified(t);
    const res = await subscribe(designer, 'DESIGNER_FREE').expect(201);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('a trial plan starts a time-boxed trial', async () => {
    const designer = await registerVerified(t);
    const res = await subscribe(designer, 'DESIGNER_PRO').expect(201);
    expect(res.body.data.status).toBe('TRIALING');
    const trialEnds = new Date(res.body.data.trialEndsAt).getTime();
    expect(trialEnds - Date.now()).toBeGreaterThan(13 * DAY_MS);
    expect(trialEnds - Date.now()).toBeLessThanOrEqual(14 * DAY_MS + 60_000);
    expect(new Date(res.body.data.currentPeriodEnd).getTime()).toBe(trialEnds);
  });

  it('a paid plan without an available trial requires payment', async () => {
    const designer = await registerVerified(t);
    const res = await subscribe(designer, await paidPlanWithoutTrial()).expect(402);
    expect(res.body.code).toBe('PAYMENT_REQUIRED');
    expect(await t.prisma.subscription.count({ where: { userId: designer.id } })).toBe(0);
  });

  it('a trial cannot be restarted after it was used', async () => {
    const designer = await registerVerified(t);
    const first = await subscribe(designer, 'DESIGNER_PRO').expect(201);
    await t.prisma.subscription.update({ where: { id: first.body.data.id }, data: { status: 'EXPIRED' } });

    const again = await subscribe(designer, 'DESIGNER_PRO').expect(402);
    expect(again.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('simultaneous subscribe calls create a single subscription', async () => {
    const designer = await registerVerified(t);
    const results = await Promise.all(Array.from({ length: 5 }, () => subscribe(designer, 'DESIGNER_FREE')));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await t.prisma.subscription.count({ where: { userId: designer.id } })).toBe(1);
  });

  it('entitlements stop when the trial ends, even before the sweep runs', async () => {
    const designer = await registerVerified(t);
    const sub = await subscribe(designer, 'DESIGNER_PRO').expect(201);
    expect(await entitlementKeys(designer)).toContain('personal_visualization');

    await t.prisma.subscription.update({
      where: { id: sub.body.data.id },
      data: { trialEndsAt: new Date(Date.now() - 1000), currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    expect(await entitlementKeys(designer)).toEqual([]);
  });

  it('cancelling keeps access until the end of the paid-for period', async () => {
    const designer = await registerVerified(t);
    await subscribe(designer, 'DESIGNER_PRO').expect(201);
    const cancelled = await t.http.post(`${API}/subscriptions/cancel`).set(designer.auth).send({}).expect(201);
    expect(cancelled.body.data.cancelAtPeriodEnd).toBe(true);
    expect(cancelled.body.data.status).toBe('TRIALING');
    expect(await entitlementKeys(designer)).toContain('personal_visualization');
  });

  it('a paid period that ended grants nothing, even before the sweep runs', async () => {
    const designer = await registerVerified(t);
    const sub = (await subscribe(designer, 'DESIGNER_PRO').expect(201)).body.data as { id: string };
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 60_000) },
    });
    expect(await entitlementKeys(designer)).not.toContain('personal_visualization');
    await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    expect(await entitlementKeys(designer)).not.toContain('personal_visualization');
  });

  it('a trial is granted once per role, but the other role still has its own', async () => {
    const both = await registerVerified(t, { roles: ['DESIGNER', 'JEWELER'] });
    const trial = (await subscribe(both, 'DESIGNER_PRO').expect(201)).body.data as { id: string };
    await t.prisma.subscription.update({ where: { id: trial.id }, data: { status: 'EXPIRED' } });
    await subscribe(both, 'DESIGNER_PRO').expect(402);
    const jewelerTrial = await subscribe(both, 'JEWELER_ACTIVE').expect(201);
    expect(jewelerTrial.body.data.status).toBe('TRIALING');
  });

  it('a past-due subscription can be cancelled at once, so another plan can be chosen', async () => {
    const designer = await registerVerified(t);
    const sub = (await subscribe(designer, 'DESIGNER_PRO').expect(201)).body.data as { id: string };
    await t.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'PAST_DUE', currentPeriodEnd: new Date(Date.now() - DAY_MS) },
    });
    const cancelled = await t.http.post(`${API}/subscriptions/cancel`).set(designer.auth).send({}).expect(201);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    await subscribe(designer, 'DESIGNER_FREE').expect(201);
  });

  it('deleting the account and registering again does not grant another trial', async () => {
    const first = await registerVerified(t);
    await subscribe(first, 'DESIGNER_PRO').expect(201);
    await t.http.delete(`${API}/users/me`).set(first.auth).expect(200);

    const again = await registerVerified(t, { email: first.email });
    const res = await subscribe(again, 'DESIGNER_PRO').expect(402);
    expect(res.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('an address alias (+tag) does not grant another trial either', async () => {
    const first = await registerVerified(t);
    await subscribe(first, 'DESIGNER_PRO').expect(201);
    const [local, domain] = first.email.split('@');
    const alias = await registerVerified(t, { email: `${local}+again@${domain}` });
    await subscribe(alias, 'DESIGNER_PRO').expect(402);
  });

  describe('lifecycle sweep', () => {
    async function seedSubscription(planCode: string, data: Record<string, unknown>) {
      const user = await registerVerified(t);
      const plan = await t.prisma.planCatalog.findUniqueOrThrow({ where: { code: planCode } });
      return t.prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          role: plan.role,
          billingCycle: plan.billingCycle,
          status: 'ACTIVE',
          currentPeriodStart: new Date(Date.now() - 31 * DAY_MS),
          currentPeriodEnd: new Date(Date.now() - DAY_MS),
          ...data,
        },
      });
    }

    async function sweep() {
      await t.app.get(SubscriptionLifecycleService).runOnce(new Date());
    }

    it('expires a finished trial', async () => {
      const sub = await seedSubscription('DESIGNER_PRO', {
        status: 'TRIALING',
        trialEndsAt: new Date(Date.now() - DAY_MS),
      });
      await sweep();
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('EXPIRED');
    });

    it('ends a cancelled subscription at period end', async () => {
      const sub = await seedSubscription('DESIGNER_PRO', { cancelAtPeriodEnd: true });
      await sweep();
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('CANCELLED');
    });

    it('marks an unpaid paid plan past due', async () => {
      const sub = await seedSubscription('DESIGNER_PRO', {});
      await sweep();
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('PAST_DUE');
    });

    it('renews a free plan for another period', async () => {
      const sub = await seedSubscription('DESIGNER_FREE', {});
      await sweep();
      const renewed = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(renewed.status).toBe('ACTIVE');
      expect(renewed.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    });

    it('two sweeps at once renew a free plan once and allocate its leads once', async () => {
      const sub = await seedSubscription('JEWELER_BASIC', {});
      await Promise.all([sweep(), sweep()]);
      const renewed = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(renewed.currentPeriodEnd.getTime()).toBeLessThan(Date.now() + 31 * DAY_MS);
      const plan = await t.prisma.planCatalog.findUniqueOrThrow({ where: { code: 'JEWELER_BASIC' } });
      expect(await t.prisma.lead.count({ where: { subscriptionId: sub.id } })).toBe(plan.leadQuota);
    });

    it('a free plan cancelled while the sweep is renewing it is not renewed', async () => {
      const sub = await seedSubscription('DESIGNER_FREE', {});
      const lock = await lockRow(t, 'subscriptions', sub.id);
      const sweeping = sweep();
      await waitForLockWaiters(t, 1);
      await lock.release((tx) => tx.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } }));
      await sweeping;

      const row = await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(row.currentPeriodEnd.getTime()).toBe(sub.currentPeriodEnd.getTime());
    });

    it('expires a past-due subscription after the grace period', async () => {
      const sub = await seedSubscription('DESIGNER_PRO', {
        status: 'PAST_DUE',
        currentPeriodEnd: new Date(Date.now() - 30 * DAY_MS),
      });
      await sweep();
      expect((await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('EXPIRED');
    });
  });
});
