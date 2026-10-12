/** Capturing stand-in for MailService: SMTP is the only external boundary replaced in e2e tests. */
export type CapturedMail = { to: string; subject: string; body: string; at: number };

export class TestMailbox {
  readonly messages: CapturedMail[] = [];

  async send(to: string, subject: string, body: string): Promise<void> {
    this.messages.push({ to, subject, body, at: Date.now() });
  }

  to(email: string): CapturedMail[] {
    const target = email.toLowerCase();
    return this.messages.filter((m) => m.to.toLowerCase() === target);
  }

  /** Raw token from the most recent verification / reset link mailed to `email`. */
  tokenFor(email: string, kind: 'verify' | 'reset'): string {
    const marker = kind === 'verify' ? 'verify-email' : 'reset-password';
    const mails = this.to(email).filter((m) => m.body.includes(marker));
    const last = mails[mails.length - 1];
    if (!last) {
      throw new Error(`No ${kind} mail captured for ${email}`);
    }
    const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(last.body);
    if (!match) {
      throw new Error(`No token in ${kind} mail for ${email}: ${last.body}`);
    }
    return match[1];
  }
}
