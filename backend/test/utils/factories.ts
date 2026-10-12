import { UserRole } from '@prisma/client';
import { API, TestApp } from './test-app';

let sequence = 0;

export function uniqueEmail(tag = 'user'): string {
  sequence += 1;
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${tag}.${Date.now().toString(36)}.${sequence}.${nonce}@test.local`;
}

export const DEFAULT_PASSWORD = 'Passw0rd!test';

export type TestUser = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
};

export type TestJeweler = TestUser & { profileId: string };

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Registers through the API, completes e-mail verification from the captured mail, logs in. */
export async function registerVerified(
  t: TestApp,
  opts: { roles?: UserRole[]; email?: string; password?: string; firstName?: string } = {},
): Promise<TestUser> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? DEFAULT_PASSWORD;
  const mailsBefore = t.mailbox.to(email).length;
  await t.http
    .post(`${API}/auth/register`)
    .send({
      email,
      password,
      firstName: opts.firstName ?? 'Test',
      lastName: 'User',
      roles: opts.roles ?? [UserRole.DESIGNER],
    })
    .expect(201);

  // Mail is sent in the background; wait for this registration's mail (the address may be reused).
  await t.mailbox.waitForMoreThan(email, mailsBefore);
  const token = await t.mailbox.tokenFor(email, 'verify');
  await t.http.post(`${API}/auth/verify-email`).send({ token }).expect(200);
  return login(t, email, password);
}

export async function login(t: TestApp, email: string, password: string): Promise<TestUser> {
  const res = await t.http.post(`${API}/auth/login`).send({ email, password });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`login failed ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const { user, tokens } = res.body.data;
  return {
    id: user.id,
    email,
    password,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    auth: bearer(tokens.accessToken),
  };
}

export const VALID_RING_PARAMETERS = {
  size: { standard: 'US', sizeCode: '7.00' },
  metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
};

export async function itemTypeId(t: TestApp, code = 'RING'): Promise<string> {
  const res = await t.http.get(`${API}/wizard/item-types`).expect(200);
  const found = (res.body.data as Array<{ id: string; code: string }>).find((i) => i.code === code);
  if (!found) {
    throw new Error(`item type ${code} not seeded`);
  }
  return found.id;
}

export async function createDraftDesign(t: TestApp, owner: TestUser): Promise<{ id: string }> {
  const res = await t.http
    .post(`${API}/designs`)
    .set(owner.auth)
    .send({ itemTypeId: await itemTypeId(t), title: 'Test ring', parameters: VALID_RING_PARAMETERS })
    .expect(201);
  return res.body.data;
}

export async function createPublishedDesign(t: TestApp, owner: TestUser): Promise<{ id: string }> {
  const design = await createDraftDesign(t, owner);
  await t.http
    .post(`${API}/designs/${design.id}/transition`)
    .set(owner.auth)
    .send({ toStatus: 'PUBLISHED' })
    .expect(201);
  return design;
}

export async function firstRegionId(t: TestApp): Promise<string> {
  const res = await t.http.get(`${API}/master-data/regions`).expect(200);
  return res.body.data[0].id;
}

/** A jeweler account with a PUBLISHED business profile. */
export async function createPublishedJeweler(
  t: TestApp,
  profile: Record<string, unknown> = {},
): Promise<TestJeweler> {
  const jeweler = await registerVerified(t, { roles: [UserRole.JEWELER] });
  const regionId = await firstRegionId(t);
  await t.http
    .put(`${API}/jeweler-profiles/draft`)
    .set(jeweler.auth)
    .send({ regionId, payload: { businessName: 'Test Atelier', phone: '+972501234567', ...profile } })
    .expect(200);
  const published = await t.http
    .post(`${API}/jeweler-profiles/publish`)
    .set(jeweler.auth)
    .send({})
    .expect(201);
  return { ...jeweler, profileId: published.body.data.id };
}

export async function openConversation(
  t: TestApp,
  actor: TestUser,
  designId: string,
  participantUserIds: string[],
): Promise<{ id: string }> {
  const res = await t.http
    .post(`${API}/conversations`)
    .set(actor.auth)
    .send({ designId, participantUserIds })
    .expect(201);
  return res.body.data;
}

export async function createQuote(
  t: TestApp,
  jeweler: TestUser,
  conversationId: string,
  designId: string,
  extra: Record<string, unknown> = {},
): Promise<TestQuote> {
  const res = await t.http
    .post(`${API}/quotes`)
    .set(jeweler.auth)
    .send({ conversationId, designId, materialsCost: 100, laborCost: 50, etaBusinessDays: 10, ...extra })
    .expect(201);
  return res.body.data;
}

export type TestQuote = { id: string; totalPrice: string; currency: string };

/** Accepts as the owner would: confirming the exact price and currency shown on the quote card. */
export function acceptQuote(t: TestApp, owner: TestUser, quote: TestQuote) {
  return t.http
    .post(`${API}/quotes/${quote.id}/accept`)
    .set(owner.auth)
    .send({ expectedTotalPrice: Number(quote.totalPrice), expectedCurrency: quote.currency });
}

/** Designer with a published design and a published jeweler holding an open conversation on it. */
export async function marketplaceScenario(t: TestApp) {
  const designer = await registerVerified(t);
  const design = await createPublishedDesign(t, designer);
  const jeweler = await createPublishedJeweler(t);
  const conversation = await openConversation(t, jeweler, design.id, [designer.id]);
  return { designer, design, jeweler, conversation };
}
