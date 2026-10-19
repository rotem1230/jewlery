import { randomUUID } from 'crypto';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { createPublishedDesign, createPublishedJeweler, registerVerified, TestJeweler, TestUser } from '../utils/factories';

/**
 * Regressions: once any request had reached a jeweler, the rule meant to charge one lead per
 * design blocked that design from ever reaching them again; and a repeated broadcast failed with
 * ALREADY_REQUESTED instead of reaching the jewelers the first one had not.
 */
describe('design request delivery', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { ATELIER_BROADCAST_FANOUT: '1' } });
  });

  afterAll(async () => {
    await t.close();
  });

  /** A region of its own, so other suites' jewelers are not candidates for these broadcasts. */
  async function isolatedRegion(): Promise<string> {
    const region = await t.prisma.region.create({
      data: { code: `TEST_${randomUUID().slice(0, 8)}`, labelHe: 'אזור בדיקה', sortOrder: 9999 },
    });
    return region.id;
  }

  function request(designer: TestUser, designId: string, body: Record<string, unknown>) {
    return t.http.post(`${API}/atelier/requests`).set(designer.auth).send({ designId, ...body });
  }

  async function leadsConsumed(jeweler: TestJeweler) {
    return t.prisma.lead.count({ where: { subscription: { userId: jeweler.id }, status: 'CONSUMED' } });
  }

  it('a design whose earlier request has closed can reach the same jeweler again, without a second lead', async () => {
    // A new jeweler starts on the free trial plan.
    const jeweler = await createPublishedJeweler(t);
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const targeted = { mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] };

    const first = await request(designer, design.id, targeted).expect(201);
    const whileOpen = await request(designer, design.id, targeted).expect(409);
    expect(whileOpen.body.code).toBe('ALREADY_REQUESTED');

    await t.prisma.designRequest.update({ where: { id: first.body.data.id }, data: { status: 'EXPIRED' } });
    await request(designer, design.id, targeted).expect(201);
    expect(await leadsConsumed(jeweler)).toBe(1);
  });

  it('with quota enforcement on, re-delivering a design still needs an active subscription (only the lead is waived)', async () => {
    const jeweler = await createPublishedJeweler(t);
    const sub = await t.prisma.subscription.findFirstOrThrow({ where: { userId: jeweler.id, status: 'ACTIVE' } });
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const targeted = { mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] };
    const first = await request(designer, design.id, targeted).expect(201);
    await t.prisma.designRequest.update({ where: { id: first.body.data.id }, data: { status: 'EXPIRED' } });
    await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED', currentPeriodEnd: new Date(Date.now() - 60_000) } });

    await t.prisma.appConfig.upsert({
      where: { key: 'lead_definition' },
      update: { value: { mode: 'design_request_delivery', enforceQuota: true }, version: { increment: 1 } },
      create: { key: 'lead_definition', value: { mode: 'design_request_delivery', enforceQuota: true } },
    });
    try {
      const again = await request(designer, design.id, targeted).expect(409);
      expect(again.body.code).toBe('NO_ELIGIBLE_JEWELERS');
    } finally {
      await t.prisma.appConfig.update({
        where: { key: 'lead_definition' },
        data: { value: { mode: 'design_request_delivery', enforceQuota: false }, version: { increment: 1 } },
      });
    }
  });

  it('a repeated broadcast reaches the jewelers the earlier one did not, instead of failing', async () => {
    const regionId = await isolatedRegion();
    const first = await createPublishedJeweler(t, {}, { regionId });
    const second = await createPublishedJeweler(t, {}, { regionId });
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    await t.prisma.design.update({ where: { id: design.id }, data: { preferredRegionId: regionId } });

    const one = await request(designer, design.id, { mode: 'BROADCAST' }).expect(201);
    const two = await request(designer, design.id, { mode: 'BROADCAST' }).expect(201);
    const reached = [...one.body.data.targets, ...two.body.data.targets].map(
      (target: { jewelerProfileId: string }) => target.jewelerProfileId,
    );
    expect(reached.sort()).toEqual([first.profileId, second.profileId].sort());

    const third = await request(designer, design.id, { mode: 'BROADCAST' }).expect(409);
    expect(third.body.code).toBe('ALREADY_REQUESTED');
  });
});
