/** Capturing stand-in for MailService: SMTP is the only external boundary replaced in e2e tests. */
export type CapturedMail = { to: string; subject: string; body: string; at: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class TestMailbox {
  readonly messages: CapturedMail[] = [];
  /** Simulated SMTP latency, to prove that requests do not wait for delivery. */
  delayMs = 0;
  private inFlight = 0;

  async send(to: string, subject: string, body: string): Promise<void> {
    this.inFlight += 1;
    try {
      if (this.delayMs > 0) {
        await sleep(this.delayMs);
      }
      this.messages.push({ to, subject, body, at: Date.now() });
    } finally {
      this.inFlight -= 1;
    }
  }

  /** Mails being sent right now (inside the simulated SMTP latency). */
  get sending(): number {
    return this.inFlight;
  }

  to(email: string): CapturedMail[] {
    const target = email.toLowerCase();
    return this.messages.filter((m) => m.to.toLowerCase() === target);
  }

  /**
   * Raw token from the most recent verification / reset link mailed to `email`. Mail is sent in
   * the background, so this waits for it to arrive.
   */
  async tokenFor(email: string, kind: 'verify' | 'reset', timeoutMs = 5_000): Promise<string> {
    const marker = kind === 'verify' ? 'verify-email' : 'reset-password';
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const mails = this.to(email).filter((m) => m.body.includes(marker));
      const last = mails[mails.length - 1];
      if (last) {
        const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(last.body);
        if (!match) {
          throw new Error(`No token in ${kind} mail for ${email}: ${last.body}`);
        }
        return match[1];
      }
      if (Date.now() > deadline) {
        throw new Error(`No ${kind} mail captured for ${email}`);
      }
      await sleep(10);
    }
  }

  /** Waits until more than `count` mails were delivered to `email`. */
  async waitForMoreThan(email: string, count: number, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.to(email).length <= count) {
      if (Date.now() > deadline) {
        throw new Error(`No new mail for ${email}`);
      }
      await sleep(10);
    }
  }

  /** Waits until no mail is being sent and nothing new arrived for `quietMs`. */
  async settle(quietMs = 250, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let count = this.messages.length;
    let quietSince = Date.now();
    while (Date.now() < deadline) {
      await sleep(20);
      if (this.messages.length !== count || this.inFlight > 0) {
        count = this.messages.length;
        quietSince = Date.now();
      } else if (Date.now() - quietSince >= quietMs) {
        return;
      }
    }
    throw new Error('mailbox did not settle');
  }
}
