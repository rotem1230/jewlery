import { createHmac } from 'crypto';

/** Domains whose mailboxes ignore dots in the local part. */
const DOTLESS_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * The mailbox behind an address: lower-case, without a "+tag", and for Gmail without dots, so
 * aliases of one inbox count as one identity.
 */
export function normalizeMailbox(email: string): string {
  const [rawLocal, rawDomain = ''] = email.trim().toLowerCase().split('@');
  // "+tag" is an alias of the part before it; an address that starts with "+" has no such part.
  const plus = rawLocal.indexOf('+');
  let local = plus > 0 ? rawLocal.slice(0, plus) : rawLocal;
  let domain = rawDomain;
  if (DOTLESS_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

/**
 * Keyed hash of the mailbox for trial bookkeeping: survives account deletion without keeping the
 * address itself (a plain hash of an e-mail address is easy to reverse by guessing).
 */
export function trialIdentityHash(email: string, secret: string): string {
  const key = createHmac('sha256', secret).update('malinvosky:trial-grant:v1').digest();
  return createHmac('sha256', key).update(normalizeMailbox(email)).digest('hex');
}
