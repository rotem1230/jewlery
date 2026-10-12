import { createPublicKey, createVerify, JsonWebKey } from 'crypto';

export type JwkWithId = JsonWebKey & { kid?: string; use?: string };

export type JwtVerifyOptions = {
  issuers: readonly string[];
  audiences: readonly string[];
  /** Tolerated clock drift for exp / iat / nbf. */
  clockSkewSeconds?: number;
  nowSeconds?: number;
};

export type VerifiedClaims = Record<string, unknown> & { sub: string; iss: string };

export class JwtVerificationError extends Error {
  constructor(
    message: string,
    readonly reason: 'malformed' | 'algorithm' | 'unknown_key' | 'signature' | 'claims',
  ) {
    super(message);
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decodeSegment(segment: string): Record<string, unknown> {
  if (!BASE64URL.test(segment)) {
    throw new JwtVerificationError('Malformed token segment', 'malformed');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new JwtVerificationError('Malformed token segment', 'malformed');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new JwtVerificationError('Malformed token segment', 'malformed');
  }
  return parsed as Record<string, unknown>;
}

function claimError(message: string): JwtVerificationError {
  return new JwtVerificationError(message, 'claims');
}

/**
 * Verifies an RS256 JWT against a JWK set: algorithm pinned to RS256 (no `none`, no HMAC
 * confusion), key selected by `kid`, signature, then exp / iat / nbf / iss / aud / sub.
 */
export function verifyRs256Jwt(token: string, keys: readonly JwkWithId[], options: JwtVerifyOptions): VerifiedClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new JwtVerificationError('Malformed token', 'malformed');
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeSegment(headerPart);
  const payload = decodeSegment(payloadPart);
  if (!BASE64URL.test(signaturePart)) {
    throw new JwtVerificationError('Malformed signature', 'malformed');
  }

  if (header.alg !== 'RS256') {
    throw new JwtVerificationError('Unsupported token algorithm', 'algorithm');
  }
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && (key.use ?? 'sig') === 'sig');
  if (!jwk) {
    throw new JwtVerificationError('Unknown signing key', 'unknown_key');
  }

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const signatureOk = createVerify('RSA-SHA256')
    .update(`${headerPart}.${payloadPart}`)
    .verify(publicKey, Buffer.from(signaturePart, 'base64url'));
  if (!signatureOk) {
    throw new JwtVerificationError('Invalid token signature', 'signature');
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  if (typeof payload.exp !== 'number' || payload.exp + skew < now) {
    throw claimError('Token expired');
  }
  if (payload.iat !== undefined && (typeof payload.iat !== 'number' || payload.iat - skew > now)) {
    throw claimError('Token issued in the future');
  }
  if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf - skew > now)) {
    throw claimError('Token not yet valid');
  }
  if (typeof payload.iss !== 'string' || !options.issuers.includes(payload.iss)) {
    throw claimError('Unexpected token issuer');
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.some((aud) => typeof aud === 'string' && options.audiences.includes(aud))) {
    throw claimError('Unexpected token audience');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw claimError('Token has no subject');
  }
  return payload as VerifiedClaims;
}
