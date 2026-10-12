import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { User, UserStatus } from '@prisma/client';
import { AUTH_ERROR } from '../../auth/constants';
import { ALLOW_UNVERIFIED_KEY } from '../decorators/allow-unverified.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      throw (
        err ??
        new UnauthorizedException({
          success: false,
          message: 'Unauthorized',
          code: AUTH_ERROR.TOKEN_INVALID,
        })
      );
    }

    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((user as unknown as User).status === UserStatus.PENDING_VERIFICATION && !allowUnverified) {
      throw new ForbiddenException({
        success: false,
        message: 'Please verify your email address first',
        code: AUTH_ERROR.EMAIL_NOT_VERIFIED,
      });
    }
    return user;
  }
}
