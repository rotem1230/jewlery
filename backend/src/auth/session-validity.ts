import { JwtPayload } from './interfaces/auth-user.interface';

/**
 * Whether an access token belongs to the account's current sessions: ending all sessions (sign out
 * everywhere, password change or reset, deletion) moves the account's session version on, and
 * every token issued before stops working. Tokens from before versions existed carry none (= 0).
 * Every place that accepts an access token checks this.
 */
export function isCurrentSession(payload: Pick<JwtPayload, 'sv'>, user: { sessionVersion: number }): boolean {
  return (payload.sv ?? 0) === user.sessionVersion;
}
