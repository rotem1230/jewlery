import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_ERROR } from '../constants';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../interfaces/auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
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
    return user;
  }
}
