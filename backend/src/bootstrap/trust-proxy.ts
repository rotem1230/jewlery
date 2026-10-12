/**
 * Maps TRUST_PROXY to Express's `trust proxy` setting. The client address drives the per-client
 * sign-in and mail budgets, so it must be the real client: behind N proxies use the hop count N
 * (or the proxies' addresses); exposed directly, trust no forwarding header at all.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = (raw ?? '').trim();
  if (value === '' || value.toLowerCase() === 'false' || value === '0') {
    return false;
  }
  if (value.toLowerCase() === 'true') {
    return true;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}
