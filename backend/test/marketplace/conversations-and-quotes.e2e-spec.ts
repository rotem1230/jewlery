import { API, createTestApp, TestApp } from '../utils/test-app';
import {
  createDraftDesign,
  createPublishedDesign,
  createPublishedJeweler,
  createQuote,
  marketplaceScenario,
  openConversation,
  registerVerified,
} from '../utils/factories';

/**
 * Regressions: anyone could open a conversation on any design with any users (spam relay and
 * the first step of the design hijack), and quote creation trusted any designRequestId.
 */
describe('who may open a conversation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('a published jeweler may open a chat with the owner of a published design', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const jeweler = await createPublishedJeweler(t);
    const conversation = await openConversation(t, jeweler, design.id, [designer.id]);
    expect(conversation.id).toBeDefined();
  });

  it('not about a design that is not published', async () => {
    const designer = await registerVerified(t);
    const draft = await createDraftDesign(t, designer);
    const jeweler = await createPublishedJeweler(t);
    await t.http
      .post(`${API}/conversations`)
      .set(jeweler.auth)
      .send({ designId: draft.id, participantUserIds: [designer.id] })
      .expect(403);
  });

  it('a non-owner cannot pull third parties into a conversation', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const jeweler = await createPublishedJeweler(t);
    const bystander = await registerVerified(t);
    await t.http
      .post(`${API}/conversations`)
      .set(jeweler.auth)
      .send({ designId: design.id, participantUserIds: [designer.id, bystander.id] })
      .expect(400);
    await t.http
      .post(`${API}/conversations`)
      .set(jeweler.auth)
      .send({ designId: design.id, participantUserIds: [bystander.id] })
      .expect(403);
  });

  it('a designer cannot open a conversation about someone else\'s design', async () => {
    const owner = await registerVerified(t);
    const design = await createPublishedDesign(t, owner);
    const otherDesigner = await registerVerified(t);
    await t.http
      .post(`${API}/conversations`)
      .set(otherDesigner.auth)
      .send({ designId: design.id, participantUserIds: [owner.id] })
      .expect(403);
  });

  it('a jeweler without a published profile cannot open conversations', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const unlisted = await registerVerified(t, { roles: ['JEWELER'] });
    await t.http
      .post(`${API}/conversations`)
      .set(unlisted.auth)
      .send({ designId: design.id, participantUserIds: [designer.id] })
      .expect(403);
  });

  it('the owner may only invite jewelers with a published profile', async () => {
    const designer = await registerVerified(t);
    const design = await createPublishedDesign(t, designer);
    const randomUser = await registerVerified(t);
    await t.http
      .post(`${API}/conversations`)
      .set(designer.auth)
      .send({ designId: design.id, participantUserIds: [randomUser.id] })
      .expect(403);

    const jeweler = await createPublishedJeweler(t);
    await openConversation(t, designer, design.id, [jeweler.id]);
  });
});

describe('who may quote', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('the design owner cannot quote their own design', async () => {
    const { designer, design, conversation } = await marketplaceScenario(t);
    await t.http
      .post(`${API}/quotes`)
      .set(designer.auth)
      .send({ conversationId: conversation.id, designId: design.id, materialsCost: 1, laborCost: 1, etaBusinessDays: 1 })
      .expect(403);
  });

  it('cannot quote a design that is no longer published', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    await t.http
      .post(`${API}/designs/${design.id}/transition`)
      .set(designer.auth)
      .send({ toStatus: 'ARCHIVED' })
      .expect(201);
    const res = await t.http
      .post(`${API}/quotes`)
      .set(jeweler.auth)
      .send({ conversationId: conversation.id, designId: design.id, materialsCost: 1, laborCost: 1, etaBusinessDays: 1 })
      .expect(409);
    expect(res.body.code).toBe('DESIGN_NOT_PUBLISHED');
  });

  it('a designRequestId must belong to the quoted design', async () => {
    const { designer, jeweler, design, conversation } = await marketplaceScenario(t);
    const otherDesign = await createPublishedDesign(t, designer);
    const foreignRequest = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: otherDesign.id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] })
      .expect(201);

    await t.http
      .post(`${API}/quotes`)
      .set(jeweler.auth)
      .send({
        conversationId: conversation.id,
        designId: design.id,
        designRequestId: foreignRequest.body.data.id,
        materialsCost: 1,
        laborCost: 1,
        etaBusinessDays: 1,
      })
      .expect(400);
    const request = await t.prisma.designRequest.findUniqueOrThrow({ where: { id: foreignRequest.body.data.id } });
    expect(request.status).toBe('OPEN');
  });

  it('a jeweler not targeted by a request cannot attach it', async () => {
    const { designer, design, jeweler } = await marketplaceScenario(t);
    const request = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: design.id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] })
      .expect(201);

    const outsider = await createPublishedJeweler(t);
    const outsiderConversation = await openConversation(t, outsider, design.id, [designer.id]);
    await t.http
      .post(`${API}/quotes`)
      .set(outsider.auth)
      .send({
        conversationId: outsiderConversation.id,
        designId: design.id,
        designRequestId: request.body.data.id,
        materialsCost: 1,
        laborCost: 1,
        etaBusinessDays: 1,
      })
      .expect(403);
    const stored = await t.prisma.designRequest.findUniqueOrThrow({ where: { id: request.body.data.id } });
    expect(stored.status).toBe('OPEN');
  });

  it('quoting cannot resurrect a cancelled request', async () => {
    const { designer, design, jeweler, conversation } = await marketplaceScenario(t);
    const request = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: design.id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] })
      .expect(201);
    await t.prisma.designRequest.update({ where: { id: request.body.data.id }, data: { status: 'CANCELLED' } });

    await t.http
      .post(`${API}/quotes`)
      .set(jeweler.auth)
      .send({
        conversationId: conversation.id,
        designId: design.id,
        designRequestId: request.body.data.id,
        materialsCost: 1,
        laborCost: 1,
        etaBusinessDays: 1,
      })
      .expect(400);
    const stored = await t.prisma.designRequest.findUniqueOrThrow({ where: { id: request.body.data.id } });
    expect(stored.status).toBe('CANCELLED');
  });

  it('a targeted jeweler quoting moves the request to QUOTE_SUBMITTED', async () => {
    const { designer, design, jeweler, conversation } = await marketplaceScenario(t);
    const request = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: design.id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] })
      .expect(201);
    await createQuote(t, jeweler, conversation.id, design.id, { designRequestId: request.body.data.id });
    const stored = await t.prisma.designRequest.findUniqueOrThrow({ where: { id: request.body.data.id } });
    expect(stored.status).toBe('QUOTE_SUBMITTED');
  });
});

describe('design requests', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('can only be sent for a published design', async () => {
    const designer = await registerVerified(t);
    const draft = await createDraftDesign(t, designer);
    const jeweler = await createPublishedJeweler(t);
    const res = await t.http
      .post(`${API}/atelier/requests`)
      .set(designer.auth)
      .send({ designId: draft.id, mode: 'TARGETED', targetJewelerProfileIds: [jeweler.profileId] })
      .expect(409);
    expect(res.body.code).toBe('DESIGN_NOT_PUBLISHED');
  });
});
