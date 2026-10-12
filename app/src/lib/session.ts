import type { AuthUser } from '@/src/store/store'
import type { AuthResult } from '@/src/types/api'

/** Map a login/register payload onto `setSession`. */
export function sessionFromAuth(result: AuthResult): {
  user: AuthUser
  accessToken: string
  refreshToken: string
} {
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      roles: result.user.roles,
      activeRole: result.user.activeRole,
    },
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
  }
}
