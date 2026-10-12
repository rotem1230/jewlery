import { createPublicKey, createVerify } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';

export type VerifiedOauthIdentity = {
  subject: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

function looksLikeJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 8);
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

export async function verifyOauthIdToken(
  provider: AuthProvider,
  idToken: string,
  audiences: { googleClientId?: string; appleClientId?: string },
): Promise<VerifiedOauthIdentity> {
  if (!looksLikeJwt(idToken)) {
    throw new UnauthorizedException({
      success: false,
      message: 'Invalid identity token',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }

  if (provider === AuthProvider.GOOGLE) {
    return verifyGoogle(idToken, audiences.googleClientId);
  }
  return verifyApple(idToken, audiences.appleClientId);
}

async function verifyGoogle(idToken: string, clientId?: string): Promise<VerifiedOauthIdentity> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) {
    throw new UnauthorizedException({
      success: false,
      message: 'Google identity token could not be verified',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  const payload = (await res.json()) as Record<string, string>;
  if (!payload.sub) {
    throw new UnauthorizedException({
      success: false,
      message: 'Google identity token missing subject',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  if (clientId && payload.aud !== clientId) {
    throw new UnauthorizedException({
      success: false,
      message: 'Google identity token audience mismatch',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  return {
    subject: payload.sub,
    email: payload.email,
    firstName: payload.given_name,
    lastName: payload.family_name,
  };
}

async function verifyApple(idToken: string, clientId?: string): Promise<VerifiedOauthIdentity> {
  const [headerPart, payloadPart, signaturePart] = idToken.split('.');
  const header = decodeJwtPart(headerPart);
  const payload = decodeJwtPart(payloadPart);
  const keysRes = await fetch('https://appleid.apple.com/auth/keys');
  if (!keysRes.ok) {
    throw new UnauthorizedException({
      success: false,
      message: 'Apple identity keys unavailable',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  const { keys } = (await keysRes.json()) as { keys: Array<Record<string, string>> };
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new UnauthorizedException({
      success: false,
      message: 'Apple identity token key not found',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }

  const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  const signature = Buffer.from(signaturePart.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!verifier.verify(keyObject, signature)) {
    throw new UnauthorizedException({
      success: false,
      message: 'Apple identity token signature invalid',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  if (payload.iss !== 'https://appleid.apple.com') {
    throw new UnauthorizedException({
      success: false,
      message: 'Apple identity token issuer invalid',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  if (clientId && payload.aud !== clientId) {
    throw new UnauthorizedException({
      success: false,
      message: 'Apple identity token audience mismatch',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  if (typeof payload.sub !== 'string') {
    throw new UnauthorizedException({
      success: false,
      message: 'Apple identity token missing subject',
      code: 'OAUTH_TOKEN_INVALID',
    });
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}
