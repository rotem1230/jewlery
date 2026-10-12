import { User, UserRole } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash'>;

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

export type AuthResult = {
  user: SafeUser;
  tokens: AuthTokens;
};

export type JwtPayload = {
  sub: string;
  email: string;
  roles: UserRole[];
  activeRole: UserRole;
};
