import { createHmac } from 'crypto';
import { verifyWebhookSignature } from './webhook-signature';

const SECRET = 'whsec_unit_test_secret_0123456789';
const NOW = 1_800_000_000;
const BODY = Buffer.from('{"providerEventId":"evt_1","type":"invoice.paid"}');

function sign(body: Buffer, timestamp: number, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

function verify(header: string | undefined, body = BODY) {
  return verifyWebhookSignature({ rawBody: body, header, secret: SECRET, toleranceSeconds: 300, nowSeconds: NOW });
}

describe('verifyWebhookSignature', () => {
  it('accepts a fresh signature over the exact body', () => {
    expect(verify(`t=${NOW},v1=${sign(BODY, NOW)}`)).toBe(true);
  });

  it('accepts when any of several v1 signatures matches (secret rotation)', () => {
    expect(verify(`t=${NOW},v1=${sign(BODY, NOW, 'old-secret')},v1=${sign(BODY, NOW)}`)).toBe(true);
  });

  it.each([
    ['missing header', undefined],
    ['empty header', ''],
    ['no timestamp', `v1=${sign(BODY, NOW)}`],
    ['no signature', `t=${NOW}`],
    ['non-numeric timestamp', `t=abc,v1=${sign(BODY, NOW)}`],
    ['signature of another secret', `t=${NOW},v1=${sign(BODY, NOW, 'attacker')}`],
    ['signature truncated', `t=${NOW},v1=${sign(BODY, NOW).slice(0, 40)}`],
    ['timestamp too old', `t=${NOW - 301},v1=${sign(BODY, NOW - 301)}`],
    ['timestamp too far in the future', `t=${NOW + 301},v1=${sign(BODY, NOW + 301)}`],
    ['signed timestamp swapped', `t=${NOW},v1=${sign(BODY, NOW - 1)}`],
  ])('rejects %s', (_label, header) => {
    expect(verify(header)).toBe(false);
  });

  it('rejects when the body differs by one byte', () => {
    const tampered = Buffer.from(BODY.toString().replace('evt_1', 'evt_2'));
    expect(verify(`t=${NOW},v1=${sign(BODY, NOW)}`, tampered)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(
      verifyWebhookSignature({ rawBody: BODY, header: `t=${NOW},v1=${sign(BODY, NOW, '')}`, secret: '', toleranceSeconds: 300, nowSeconds: NOW }),
    ).toBe(false);
  });
});
