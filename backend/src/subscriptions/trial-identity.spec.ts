import { normalizeMailbox, trialIdentityHash } from './trial-identity';

describe('trial identity', () => {
  it('treats aliases of one inbox as one identity', () => {
    expect(normalizeMailbox(' Dana+promo@Example.com ')).toBe('dana@example.com');
    expect(normalizeMailbox('d.a.n.a@gmail.com')).toBe('dana@gmail.com');
    expect(normalizeMailbox('dana@googlemail.com')).toBe('dana@gmail.com');
  });

  it('keeps dots where the provider does not ignore them', () => {
    expect(normalizeMailbox('d.ana@example.com')).toBe('d.ana@example.com');
  });

  it('hashes with a secret: same identity, same hash; another secret, another hash', () => {
    const secret = 's'.repeat(40);
    expect(trialIdentityHash('dana+x@example.com', secret)).toBe(trialIdentityHash('DANA@example.com', secret));
    expect(trialIdentityHash('dana@example.com', secret)).not.toBe(trialIdentityHash('dana@example.com', 't'.repeat(40)));
    expect(trialIdentityHash('dana@example.com', secret)).not.toContain('dana');
  });
});
