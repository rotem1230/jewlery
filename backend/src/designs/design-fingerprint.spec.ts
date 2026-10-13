import { designFingerprint, stableJson } from './design-fingerprint';

describe('design fingerprint', () => {
  it('does not depend on the order object keys were written in', () => {
    const a = { metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' }, size: { standard: 'US', sizeCode: '7.00' } };
    const b = { size: { sizeCode: '7.00', standard: 'US' }, metal: { purityCode: '14K', metalCode: 'YELLOW_GOLD' } };
    expect(stableJson(a)).toBe(stableJson(b));
    expect(designFingerprint(a)).toBe(designFingerprint(b));
  });

  it('changes with any value, including the order of a list', () => {
    const base = { metal: { metalCode: 'YELLOW_GOLD' }, stones: [{ code: 'A' }, { code: 'B' }] };
    expect(designFingerprint({ ...base, metal: { metalCode: 'WHITE_GOLD' } })).not.toBe(designFingerprint(base));
    expect(designFingerprint({ ...base, stones: [{ code: 'B' }, { code: 'A' }] })).not.toBe(designFingerprint(base));
  });

  it('treats a missing key and an undefined one alike, and null distinctly', () => {
    expect(stableJson({ a: 1, b: undefined })).toBe(stableJson({ a: 1 }));
    expect(stableJson({ a: 1, b: null })).not.toBe(stableJson({ a: 1 }));
  });
});
