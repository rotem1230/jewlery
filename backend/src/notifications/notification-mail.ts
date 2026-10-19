/**
 * The e-mail sent for an in-app update. The update itself keeps its English title and body (the
 * app shows its own Hebrew wording per event); the e-mail is Hebrew first: a Hebrew subject and
 * text, then the English original (which also carries details such as an amount).
 */

const HEBREW = /[֐-׿]/;
const HEBREW_START = /^[֐-׿]/;
const APP_LINE = 'לפרטים נוספים היכנסו לאפליקציית מלינובסקי.';

type MailCopy = { subject: string; body: string };

function payloadText(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** "הודעה חדשה מדנה", or with a hyphen before a name in Latin letters: "הודעה חדשה מ-QA Goldsmith". */
function fromName(name: string): string {
  return HEBREW_START.test(name) ? `מ${name}` : `מ-${name}`;
}

const EVENT_COPY: Record<string, (payload: unknown) => MailCopy> = {
  'message.new': (payload) => {
    const sender = payloadText(payload, 'senderName');
    const design = payloadText(payload, 'designTitle');
    return {
      subject: sender ? `הודעה חדשה ${fromName(sender)}` : 'הודעה חדשה',
      body: design ? `קיבלת הודעה חדשה בשיחה על העיצוב "${design}".` : 'קיבלת הודעה חדשה.',
    };
  },
  'quote.created': () => ({ subject: 'התקבלה הצעת מחיר חדשה', body: 'צורף שלח לך הצעת מחיר חדשה לעיצוב שלך.' }),
  'quote.updated': () => ({ subject: 'הצעת מחיר עודכנה', body: 'צורף עדכן הצעת מחיר שקיבלת.' }),
  'quote.accepted': () => ({
    subject: 'הצעת המחיר אושרה',
    body: 'הצעת המחיר אושרה. את ההמשך מתאמים בשיחה באפליקציה.',
  }),
  'quote.declined': () => ({ subject: 'הצעת המחיר נדחתה', body: 'הצעת המחיר שלך נדחתה.' }),
  'quote.withdrawn': () => ({ subject: 'הצעת מחיר נמשכה', body: 'הצעת מחיר שקיבלת על העיצוב שלך נמשכה.' }),
  'handoff.created': () => ({
    subject: 'פרטי ההתקשרות מוכנים',
    body: 'הקישור להמשך ההתקשרות הישירה בוואטסאפ מחכה בשיחה על הצעת המחיר שאושרה.',
  }),
  'design.published': () => ({ subject: 'העיצוב שלך פורסם', body: 'העיצוב שלך מוצג עכשיו באטלייה.' }),
  'design_request.delivered': () => ({
    subject: 'בקשה חדשה להצעת מחיר',
    body: 'מעצב/ת שלח/ה לך בקשה להצעת מחיר על עיצוב.',
  }),
  'ai.completed': () => ({ subject: 'תמונת ההשראה מוכנה', body: 'תמונת ההשראה שלך מוכנה לצפייה.' }),
  'jewelry_payment.received': () => ({
    subject: 'התקבל תשלום על הזמנה',
    body: 'המעצב/ת שילם/ה באפליקציה על הצעת המחיר שלך. הסכום יועבר אליך לאחר העיבוד.',
  }),
  'render.completed': () => ({ subject: 'קובץ הייצוא מוכן', body: 'קובץ הייצוא שלך מוכן להורדה.' }),
  'visualization.completed': () => ({ subject: 'ההדמיה מוכנה', body: 'ההדמיה שלך מוכנה לצפייה.' }),
};

export function notificationMail(eventKey: string, title: string, body: string, payload?: unknown): MailCopy {
  const copy = EVENT_COPY[eventKey]?.(payload);
  if (copy) {
    const english = [title, body].filter((part) => part.trim()).join(' — ');
    return { subject: copy.subject, body: `${copy.body}\n${APP_LINE}\n\n${english}` };
  }
  // An update written in Hebrew already (e.g. by an operator) is sent as written.
  if (HEBREW.test(title)) {
    return { subject: title, body: `${body}\n${APP_LINE}` };
  }
  const english = [title, body].filter((part) => part.trim()).join(' — ');
  return { subject: 'עדכון חדש במלינובסקי', body: `יש לך עדכון חדש.\n${APP_LINE}\n\n${english}` };
}
