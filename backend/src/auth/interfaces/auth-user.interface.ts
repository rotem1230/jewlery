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

/** Registration never opens a session; the e-mail must be verified first. */
export type RegisterResult = {
  user: SafeUser;
  requiresEmailVerification: true;
};

export type JwtPayload = {
  sub: string;
  email: string;
  roles: UserRole[];
  activeRole: UserRole;
  /** The account's session version when the token was issued (absent in older tokens = 0). */
  sv?: number;
};
