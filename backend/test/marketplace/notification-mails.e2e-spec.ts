import { API, createTestApp, TestApp } from '../utils/test-app';
import { acceptQuote, createQuote, marketplaceScenario } from '../utils/factories';

const HEBREW = /[֐-׿]/;

/**
 * QA: notification e-mails ("Quote accepted", "Handoff ready", …) reached Hebrew-speaking users
 * in English only. Every notification e-mail has a Hebrew subject and a Hebrew body, with the
 * English text after it.
 */
describe('notification e-mails', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function mailWithSubject(email: string, subject: string) {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const found = t.mailbox.to(email).find((mail) => mail.subject === subject);
      if (found) {
        return found;
      }
      if (Date.now() > deadline) {
        throw new Error(`No "${subject}" mail for ${email}: ${JSON.stringify(t.mailbox.to(email).map((m) => m.subject))}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it('a new quote, a new message and an accepted quote are mailed in Hebrew first', async () => {
    const s = await marketplaceScenario(t);
    const quote = await createQuote(t, s.jeweler, s.conversation.id, s.design.id);

    const quoteMail = await mailWithSubject(s.designer.email, 'התקבלה הצעת מחיר חדשה');
    expect(quoteMail.body.split('\n')[0]).toMatch(HEBREW);
    // The English text, with the amount, follows.
    expect(quoteMail.body).toContain(`You received a new quote of ${quote.totalPrice}`);

    await t.http
      .post(`${API}/conversations/${s.conversation.id}/messages`)
      .set(s.designer.auth)
      .send({ type: 'TEXT', body: 'אפשר בזהב אדום?' })
      .expect(201);
    const messageMail = await mailWithSubject(s.jeweler.email, 'הודעה חדשה מ-Test');
    expect(messageMail.body.split('\n')[0]).toMatch(HEBREW);

    await acceptQuote(t, s.designer, quote).expect(201);
    const accepted = await mailWithSubject(s.designer.email, 'הצעת המחיר אושרה');
    expect(accepted.body.split('\n')[0]).toMatch(HEBREW);
    for (const mail of t.mailbox.to(s.designer.email).concat(t.mailbox.to(s.jeweler.email))) {
      if (mail.body.includes('verify-email')) continue;
      expect(mail.subject).toMatch(HEBREW);
    }
  });
});
