import { notificationMail } from './notification-mail';

const HEBREW = /[֐-׿]/;
const LATIN_WORD = /[A-Za-z]{3,}/;

/** The English titles and bodies the server stores for in-app updates (the app translates those). */
const EVENTS: Array<[string, string, string]> = [
  ['quote.created', 'New quote received', 'You received a new quote of 4500 ILS'],
  ['quote.updated', 'Quote updated', 'A quote was updated to 4700 ILS'],
  ['quote.accepted', 'Quote accepted', 'A designer accepted your quote. Continue the WhatsApp handoff from the conversation.'],
  ['quote.declined', 'Quote declined', 'Your quote was declined.'],
  ['quote.withdrawn', 'Quote withdrawn', 'A jeweler closed their account; their quote on your design was withdrawn.'],
  ['handoff.created', 'Handoff ready', 'WhatsApp handoff is ready for the accepted quote.'],
  ['design.published', 'Design published', 'Your design is live in the Atelier marketplace.'],
  ['design_request.delivered', 'New design request', 'A designer sent you a request to quote.'],
  ['ai.completed', 'AI inspiration ready', 'Your inspiration model is ready to preview.'],
  ['render.completed', 'Export ready', 'Your render/export file is ready to download.'],
  ['visualization.completed', 'Try-on ready', 'Your visualization overlay is ready.'],
  ['message.new', 'New message', 'You have a new message'],
];

describe('notification e-mails are Hebrew first', () => {
  it.each(EVENTS)('%s: a Hebrew subject, a Hebrew body, then the English text', (eventKey, title, body) => {
    const mail = notificationMail(eventKey, title, body);
    expect(mail.subject).toMatch(HEBREW);
    expect(mail.subject).not.toMatch(LATIN_WORD);
    const [firstLine] = mail.body.split('\n');
    expect(firstLine).toMatch(HEBREW);
    expect(firstLine).not.toMatch(LATIN_WORD);
    // The English original follows the Hebrew text (amounts and details included).
    expect(mail.body.indexOf(body)).toBeGreaterThan(mail.body.indexOf(firstLine));
  });

  it('a new message names its sender and design', () => {
    const latin = notificationMail('message.new', 'New message from QA Goldsmith', 'About "Evening ring"', {
      senderName: 'QA Goldsmith',
      designTitle: 'Evening ring',
    });
    expect(latin.subject).toBe('הודעה חדשה מ-QA Goldsmith');
    expect(latin.body).toContain('"Evening ring"');

    const hebrew = notificationMail('message.new', 'New message from דנה', 'About "טבעת ערב"', {
      senderName: 'דנה',
      designTitle: 'טבעת ערב',
    });
    expect(hebrew.subject).toBe('הודעה חדשה מדנה');
  });

  it('an update the mailer does not know keeps a Hebrew title, and gets a Hebrew subject otherwise', () => {
    expect(notificationMail('promo.custom', 'מבצע לחברים', 'עד סוף החודש')).toEqual({
      subject: 'מבצע לחברים',
      body: expect.stringContaining('עד סוף החודש'),
    });
    const english = notificationMail('job.completed', 'Job completed', 'A background job finished.');
    expect(english.subject).toMatch(HEBREW);
    expect(english.body).toContain('A background job finished.');
  });
});
