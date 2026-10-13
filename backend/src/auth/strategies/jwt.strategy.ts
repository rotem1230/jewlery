import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_AUDIENCE, JWT_ISSUER } from '../../config/configuration';
import { AUTH_ERROR } from '../constants';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../interfaces/auth-user.interface';
import { isCurrentSession } from '../session-validity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.findUserById(payload.sub);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException({
        success: false,
        message: 'User not found',
        code: AUTH_ERROR.TOKEN_INVALID,
      });
    }
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new UnauthorizedException({
        success: false,
        message: 'Account is not active',
        code: AUTH_ERROR.ACCOUNT_SUSPENDED,
      });
    }
    // Issued before the account's sessions were ended (sign out everywhere, password change...).
    if (!isCurrentSession(payload, user)) {
      throw new UnauthorizedException({
        success: false,
        message: 'Session ended',
        code: AUTH_ERROR.TOKEN_INVALID,
      });
    }
    // PENDING_VERIFICATION is refused by JwtAuthGuard unless the route is @AllowUnverified().
    return user;
  }
}
