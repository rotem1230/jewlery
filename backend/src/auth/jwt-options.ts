import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';
import { JWT_AUDIENCE, JWT_ISSUER } from '../config/configuration';

type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;

/**
 * Single source of truth for access-token crypto: HS256 only, and every token carries (and must
 * carry) this API's issuer and audience. Used by AuthModule (issue + HTTP verify) and ChatModule
 * (socket handshake verify).
 */
export function jwtModuleOptions(config: ConfigService): JwtModuleOptions {
  return {
    secret: config.getOrThrow<string>('jwt.secret'),
    signOptions: {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: config.get<string>('jwt.expiresIn', '15m') as Duration,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  };
}
