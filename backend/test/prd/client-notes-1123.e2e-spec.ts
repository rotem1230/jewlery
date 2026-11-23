import { API, createTestApp, TestApp } from '../utils/test-app';
import { acceptQuote, createDraftDesign, createQuote, itemTypeId, marketplaceScenario, registerVerified, VALID_RING_PARAMETERS } from '../utils/factories';

/** The client's notes of 23.11.2026 (the PDF and the extra notes), on the server side. */
describe('client notes of 23.11', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const save = (design: { id: string }, auth: Record<string, string>, version: number, parameters: Record<string, unknown>) =>
    t.http.patch(`${API}/designs/${design.id}`).set(auth).send({ version, parameters });

  describe('metals: gold 14K and 18K, and silver; no 12K, no platinum', () => {
    it('the metal list offers only what is made', async () => {
      const res = await t.http.get(`${API}/master-data/metals`).expect(200);
      const metals = res.body.data as Array<{ code: string; purities: Array<{ code: string }> }>;
      const offer = Object.fromEntries(metals.map((m) => [m.code, m.purities.map((p) => p.code).sort()]));
      expect(offer).toEqual({
        SILVER: ['925'],
        YELLOW_GOLD: ['14K', '18K'],
        ROSE_GOLD: ['14K', '18K'],
        WHITE_GOLD: ['14K', '18K'],
      });
    });

    it('a new design in 12K or platinum is refused; a design saved in it before keeps it', async () => {
      const owner = await registerVerified(t);
      const ring = await itemTypeId(t);
      for (const metal of [
        { metalCode: 'YELLOW_GOLD', purityCode: '12K' },
        { metalCode: 'PLATINUM', purityCode: '950' },
      ]) {
        const res = await t.http
          .post(`${API}/designs`)
          .set(owner.auth)
          .send({ itemTypeId: ring, title: 'x', parameters: { ...VALID_RING_PARAMETERS, metal } })
          .expect(400);
        expect(JSON.stringify(res.body)).toContain('/metal');
      }
      // An older design already in 12K (made before the change): saving its other parts still works.
      const design = await createDraftDesign(t, owner);
      const older = { ...VALID_RING_PARAMETERS, metal: { metalCode: 'YELLOW_GOLD', purityCode: '12K' } };
      await t.prisma.design.update({ where: { id: design.id }, data: { parameters: older } });
      const current = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
      await save(design, owner.auth, current.version, { ...older, personalNote: 'still 12K' }).expect(200);
    });

    it('a design in 12K is not published: jewelers would be asked to quote a metal that is not made', async () => {
      const owner = await registerVerified(t);
      const design = await createDraftDesign(t, owner);
      const older = { ...VALID_RING_PARAMETERS, metal: { metalCode: 'YELLOW_GOLD', purityCode: '12K' } };
      await t.prisma.design.update({ where: { id: design.id }, data: { parameters: older } });
      const res = await t.http.post(`${API}/designs/${design.id}/transition`).set(owner.auth).send({ toStatus: 'PUBLISHED' }).expect(400);
      expect(JSON.stringify(res.body)).toContain('/metal/purityCode');
      // In 14K it is.
      const current = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
      await save(design, owner.auth, current.version, VALID_RING_PARAMETERS).expect(200);
      await t.http.post(`${API}/designs/${design.id}/transition`).set(owner.auth).send({ toStatus: 'PUBLISHED' }).expect(201);
    });
  });

  describe('ring sizes: every size, and a size typed in', () => {
    it('the chart has every Israeli size 44–70 with its US size, the PRD sizes as the PRD gives them', async () => {
      const res = await t.http.get(`${API}/wizard/size-charts/RING`).expect(200);
      const rows = res.body.data as Array<{ standard: string; sizeCode: string; diameterMinMm: string; diameterMaxMm: string; sortOrder: number }>;
      const il = rows.filter((row) => row.standard === 'IL').map((row) => Number(row.sizeCode));
      expect(il).toEqual(Array.from({ length: 27 }, (_, i) => 44 + i));
      const us = rows.filter((row) => row.standard === 'US');
      expect(us).toHaveLength(27);
      // Each IL size has its US pair at the same place in the chart.
      for (const row of rows.filter((r) => r.standard === 'IL')) {
        expect(us.filter((u) => u.sortOrder === row.sortOrder)).toHaveLength(1);
      }
      const il52 = rows.find((row) => row.standard === 'IL' && row.sizeCode === '52')!;
      expect([Number(il52.diameterMinMm), Number(il52.diameterMaxMm)]).toEqual([16.55, 16.95]);
      const us52 = us.find((u) => u.sortOrder === il52.sortOrder)!;
      expect(us52.sizeCode).toBe('6.00');
      const il53 = rows.find((row) => row.standard === 'IL' && row.sizeCode === '53')!;
      expect(Number(il53.diameterMinMm)).toBeCloseTo(16.87, 2);
    });

    it('a size typed in (half sizes too) is saved; one out of range is refused', async () => {
      const owner = await registerVerified(t);
      const design = await createDraftDesign(t, owner);
      const res = await save(design, owner.auth, 1, { ...VALID_RING_PARAMETERS, size: { standard: 'IL', sizeCode: '53.5', bandWidthMm: 3 } }).expect(200);
      await save(design, owner.auth, res.body.data.version, { ...VALID_RING_PARAMETERS, size: { standard: 'IL', sizeCode: '200' } }).expect(400);
    });

    it('the ring measuring guide explains how to measure, with the full chart', async () => {
      const res = await t.http.get(`${API}/master-data/measurement-guides/${await itemTypeId(t)}`).query({ locale: 'he' }).expect(200);
      const body = res.body.data.body as { tips: string[]; table: Array<{ sizeCode: string }> };
      expect(body.tips.join(' ')).toContain('חוט');
      expect(body.tips.join(' ')).toContain('קוטר הפנימי');
      expect(body.table.map((row) => row.sizeCode)).toContain('53');
      expect(body.table).toHaveLength(27);
    });
  });

  describe('the size lock opens again (a draft is reused in another size)', () => {
    it('the owner opens a field they locked; nobody else can; a completed design stays as made', async () => {
      const owner = await registerVerified(t);
      const design = await createDraftDesign(t, owner);
      await t.http.post(`${API}/designs/${design.id}/lock`).set(owner.auth).send({ fields: ['size', 'metal'], confirm: true }).expect(201);
      const stranger = await registerVerified(t);
      await t.http.post(`${API}/designs/${design.id}/unlock`).set(stranger.auth).send({ fields: ['size'] }).expect(403);
      await t.http.post(`${API}/designs/${design.id}/unlock`).send({ fields: ['size'] }).expect(401);
      await t.http.post(`${API}/designs/${design.id}/unlock`).set(owner.auth).send({ fields: [] }).expect(400);

      const opened = await t.http.post(`${API}/designs/${design.id}/unlock`).set(owner.auth).send({ fields: ['size'] }).expect(201);
      expect(opened.body.data.lockedFields).toEqual(['metal']);
      await save(design, owner.auth, opened.body.data.version, { ...VALID_RING_PARAMETERS, size: { standard: 'IL', sizeCode: '57', bandWidthMm: 4 } }).expect(200);
      const logged = await t.prisma.auditLog.findFirst({ where: { action: 'design.unlock', entityId: design.id } });
      expect(logged?.actorUserId).toBe(owner.id);

      // A design whose quote was accepted is made as agreed: its lock stays.
      const s = await marketplaceScenario(t);
      await t.http.post(`${API}/designs/${s.design.id}/lock`).set(s.designer.auth).send({ fields: ['size'], confirm: true }).expect(201);
      const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);
      await acceptQuote(t, s.designer, quote).expect(201);
      await t.http.post(`${API}/designs/${s.design.id}/unlock`).set(s.designer.auth).send({ fields: ['size'] }).expect(409);
    });
  });

  describe('stones in their own colours, more shapes, shanks', () => {
    it('a diamond only white / clear; a stone saved before keeps its colour', async () => {
      const owner = await registerVerified(t);
      const design = await createDraftDesign(t, owner);
      const ruby = { stoneCode: 'DIAMOND', cutCode: 'ROUND', colorCode: 'RUBY', sizeMm: 5 };
      const refused = await save(design, owner.auth, 1, { ...VALID_RING_PARAMETERS, stones: [ruby] }).expect(400);
      expect(JSON.stringify(refused.body)).toContain('RUBY is not a colour DIAMOND comes in');
      // Saved before the change (written directly): saving the design again keeps it.
      await t.prisma.design.update({ where: { id: design.id }, data: { parameters: { ...VALID_RING_PARAMETERS, stones: [ruby] } } });
      const current = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
      await save(design, owner.auth, current.version, { ...VALID_RING_PARAMETERS, stones: [ruby], personalNote: 'kept' }).expect(200);
    });

    it('a pear-cut stone on a split shank; a split shank takes no band of stones', async () => {
      const owner = await registerVerified(t);
      const design = await createDraftDesign(t, owner);
      const split = { ...VALID_RING_PARAMETERS, size: { standard: 'IL', sizeCode: '54', bandWidthMm: 3, shankStyle: 'SPLIT' } };
      const res = await save(design, owner.auth, 1, {
        ...split,
        stones: [{ stoneCode: 'SAPPHIRE', cutCode: 'PEAR', colorCode: 'SAPPHIRE', sizeMm: 6 }],
        setting: { headCode: 'BASKET' },
      }).expect(200);
      const band = { settingCode: 'BAND_CHANNEL', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1.5 };
      const refused = await save(design, owner.auth, res.body.data.version, { ...split, setting: { headCode: 'BASKET', band } }).expect(400);
      expect(JSON.stringify(refused.body)).toContain('split shank');
      await save(design, owner.auth, res.body.data.version, {
        ...split,
        size: { ...split.size, shankStyle: 'DOUBLE' },
        setting: { headCode: 'BASKET', band },
      }).expect(200);
    });
  });
});
