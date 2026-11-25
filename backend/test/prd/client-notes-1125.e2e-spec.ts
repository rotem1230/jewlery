import { API, createTestApp, TestApp } from '../utils/test-app';
import { createDraftDesign, createQuote, marketplaceScenario, registerVerified } from '../utils/factories';

/** The client's notes of 25.11.2026: a design started by mistake can be deleted. */
describe('client notes of 25.11: deleting a design', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('the owner deletes a draft: it leaves their list and cannot be opened; the row stays (soft delete)', async () => {
    const owner = await registerVerified(t);
    const design = await createDraftDesign(t, owner);

    const res = await t.http.delete(`${API}/designs/${design.id}`).set(owner.auth).expect(200);
    expect(res.body.data).toEqual({ id: design.id, deleted: true });

    const list = await t.http.get(`${API}/designs`).set(owner.auth).expect(200);
    expect(JSON.stringify(list.body.data)).not.toContain(design.id);
    await t.http.get(`${API}/designs/${design.id}`).set(owner.auth).expect(404);
    // Twice: already gone.
    await t.http.delete(`${API}/designs/${design.id}`).set(owner.auth).expect(404);

    const row = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect(row.deletedAt).not.toBeNull();
  });

  it('someone else cannot delete it', async () => {
    const owner = await registerVerified(t);
    const other = await registerVerified(t);
    const design = await createDraftDesign(t, owner);
    await t.http.delete(`${API}/designs/${design.id}`).set(other.auth).expect(403);
    const row = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect(row.deletedAt).toBeNull();
  });

  it('a design a jeweler quoted is kept: 409 DESIGN_IN_WORK', async () => {
    const { designer, design, jeweler, conversation } = await marketplaceScenario(t);
    await createQuote(t, jeweler, conversation.id, design.id);

    const res = await t.http.delete(`${API}/designs/${design.id}`).set(designer.auth).expect(409);
    expect(JSON.stringify(res.body)).toContain('DESIGN_IN_WORK');
    const row = await t.prisma.design.findUniqueOrThrow({ where: { id: design.id } });
    expect(row.deletedAt).toBeNull();
  });
});
