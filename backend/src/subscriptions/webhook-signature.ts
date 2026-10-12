import { createHmac, timingSafeEqual } from 'crypto';

export type WebhookSignatureInput = {
  rawBody: Buffer;
  /** `x-webhook-signature: t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>...]` */
  header: string | undefined;
  secret: string;
  /** Maximum age (and future skew) of the signed timestamp, against replay. */
  toleranceSeconds: number;
  nowSeconds?: number;
};

const HEX_SHA256 = /^[a-f0-9]{64}$/;

/**
 * HMAC-SHA256 over `${t}.${rawBody}` (the scheme Stripe uses), compared in constant time.
 * Several v1 entries are allowed so the secret can be rotated without downtime.
 */
export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  const { rawBody, header, secret, toleranceSeconds } = input;
  if (!secret || !header) {
    return false;
  }

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && value && /^\d+$/.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1' && value && HEX_SHA256.test(value)) {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) {
    return false;
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return signatures.some((candidate) => timingSafeEqual(expected, Buffer.from(candidate, 'hex')));
}
