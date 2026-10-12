import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { JWKS_PROVIDER, JwksProvider } from './jwks.provider';
import { JwtVerificationError, verifyRs256Jwt, VerifiedClaims } from './jwt-rs256';

export type VerifiedOauthIdentity = {
  subject: string;
  /** Present only when the provider asserts the address is verified. */
  email?: string;
  firstName?: string;
  lastName?: string;
};

type ProviderSpec = { jwksUri: string; issuers: string[]; audienceConfigKey: string };

const PROVIDERS: Partial<Record<AuthProvider, ProviderSpec>> = {
  [AuthProvider.GOOGLE]: {
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['accounts.google.com', 'https://accounts.google.com'],
    audienceConfigKey: 'google.clientIds',
  },
  [AuthProvider.APPLE]: {
    jwksUri: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audienceConfigKey: 'apple.clientIds',
  },
};

function invalidToken(message = 'Invalid identity token'): UnauthorizedException {
  return new UnauthorizedException({ success: false, message, code: 'OAUTH_TOKEN_INVALID' });
}

function looksLikeJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 8);
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Verifies Google / Apple ID tokens locally against the provider's published keys. Fails closed:
 * a provider whose client ids are not configured cannot be used at all.
 */
@Injectable()
export class OAuthTokenVerifier {
  constructor(
    @Inject(JWKS_PROVIDER) private readonly jwks: JwksProvider,
    private readonly config: ConfigService,
  ) {}

  async verify(provider: AuthProvider, idToken: string): Promise<VerifiedOauthIdentity> {
    const spec = PROVIDERS[provider];
    if (!spec) {
      throw new BadRequestException({ success: false, message: 'Unsupported sign-in provider' });
    }
    if (!looksLikeJwt(idToken)) {
      throw invalidToken();
    }
    const audiences = this.config.get<string[]>(spec.audienceConfigKey, []);
    if (audiences.length === 0) {
      throw new ServiceUnavailableException({
        success: false,
        message: `${provider} sign-in is not configured`,
        code: 'OAUTH_NOT_CONFIGURED',
      });
    }

    const claims = await this.verifyWithRotation(spec, idToken, audiences);
    const email = typeof claims.email === 'string' && isTrue(claims.email_verified) ? claims.email : undefined;
    return {
      subject: claims.sub,
      email,
      firstName: typeof claims.given_name === 'string' ? claims.given_name : undefined,
      lastName: typeof claims.family_name === 'string' ? claims.family_name : undefined,
    };
  }

  private async verifyWithRotation(spec: ProviderSpec, idToken: string, audiences: string[]): Promise<VerifiedClaims> {
    const options = { issuers: spec.issuers, audiences };
    try {
      return verifyRs256Jwt(idToken, await this.keys(spec.jwksUri, false), options);
    } catch (err) {
      if (err instanceof JwtVerificationError && err.reason === 'unknown_key') {
        try {
          return verifyRs256Jwt(idToken, await this.keys(spec.jwksUri, true), options);
        } catch (retryErr) {
          if (retryErr instanceof JwtVerificationError) {
            throw invalidToken();
          }
          throw retryErr;
        }
      }
      if (err instanceof JwtVerificationError) {
        throw invalidToken();
      }
      throw err;
    }
  }

  private async keys(jwksUri: string, forceRefresh: boolean) {
    try {
      return await this.jwks.getKeys(jwksUri, forceRefresh);
    } catch {
      throw new ServiceUnavailableException({
        success: false,
        message: 'Identity provider keys are unavailable',
        code: 'OAUTH_PROVIDER_UNAVAILABLE',
      });
    }
  }
}
