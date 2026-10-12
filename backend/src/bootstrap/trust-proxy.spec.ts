import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it.each([undefined, '', '  ', 'false', 'FALSE', '0'])('%p trusts no forwarding headers', (raw) => {
    expect(parseTrustProxy(raw)).toBe(false);
  });

  it('a hop count trusts that many proxies', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('passes proxy addresses and subnets through for Express to validate', () => {
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.1')).toBe('10.0.0.0/8, 172.16.0.1');
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });

  it("'true' means trust every hop", () => {
    expect(parseTrustProxy('true')).toBe(true);
  });
});
