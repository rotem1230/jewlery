/**
 * Account-role actions that answer with a fresh session (`{ user, tokens }`), stored the way a
 * sign-in is: `setSession` without a remember-me choice keeps the session's own.
 * Plain thunks (not createAsyncThunk) so callers get the original ApiError for `parseApiError`.
 */
import { addRole, switchRole } from '@/src/api/auth'
import type { MarketplaceRole } from '@/src/lib/accountRoles'
import { sessionFromAuth } from '@/src/lib/session'
import type { AuthResult } from '@/src/types/api'
import { setSession, type AppDispatch } from './store'

/** PRD 5.1: take on the other marketplace role; the active role stays until the user switches. */
export function addAccountRole(role: MarketplaceRole) {
  return async (dispatch: AppDispatch): Promise<AuthResult> => {
    const result = await addRole(role)
    dispatch(setSession(sessionFromAuth(result)))
    return result
  }
}

/** Makes `role` the active one (the navigator then shows that role's tabs). */
export function switchAccountRole(role: MarketplaceRole) {
  return async (dispatch: AppDispatch): Promise<AuthResult> => {
    const result = await switchRole(role)
    dispatch(setSession(sessionFromAuth(result)))
    return result
  }
}
