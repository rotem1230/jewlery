/** Account roles on the profile screen: expanding (PRD 5.1), switching, and the per-role menu. */
import type { UserRole } from '@/src/constants/roles'
import type { TranslationKey } from '@/src/i18n'
import type { ProfileStackParamList } from '@/src/navigation/types'

/** A role a user can take on themselves (the server refuses ADMIN). */
export type MarketplaceRole = 'DESIGNER' | 'JEWELER'

/** The marketplace role the account does not hold yet, if it holds exactly one of them. */
export function roleToAdd(roles: readonly UserRole[]): MarketplaceRole | null {
  const designer = roles.includes('DESIGNER')
  const jeweler = roles.includes('JEWELER')
  if (designer && !jeweler) return 'JEWELER'
  if (jeweler && !designer) return 'DESIGNER'
  return null
}

/** The other marketplace role to switch to, when the account holds both. */
export function roleToSwitch(
  user: { roles: readonly UserRole[]; activeRole: UserRole } | null | undefined,
): MarketplaceRole | null {
  if (!user?.roles.includes('DESIGNER') || !user.roles.includes('JEWELER')) return null
  return user.activeRole === 'JEWELER' ? 'DESIGNER' : 'JEWELER'
}

type NoParamProfileRoute = {
  [K in keyof ProfileStackParamList]: ProfileStackParamList[K] extends undefined ? K : never
}[keyof ProfileStackParamList]

export type ProfileMenuItem = {
  id: string
  labelKey: TranslationKey
  route: NoParamProfileRoute
}

const SHARED_MENU_ITEMS: ProfileMenuItem[] = [
  { id: 'help', labelKey: 'profileHelp', route: 'Faq' },
  { id: 'faq', labelKey: 'profileFaq', route: 'Faq' },
  { id: 'terms', labelKey: 'profileTerms', route: 'Terms' },
]

/** Both roles reach the plans screen (jewelers subscribe too); "about" is designer copy. */
export function profileMenuItems(activeRole: UserRole | undefined, roles: readonly UserRole[] = []): ProfileMenuItem[] {
  const pricing: ProfileMenuItem = { id: 'pricing', labelKey: 'profilePricing', route: 'Pricing' }
  // The admin screens (plans, reports, refunds, payouts), for an account with the admin role.
  const admin: ProfileMenuItem[] = roles.includes('ADMIN') ? [{ id: 'admin', labelKey: 'profileAdmin', route: 'AdminHome' }] : []
  if (activeRole === 'JEWELER') return [...admin, pricing, ...SHARED_MENU_ITEMS]
  return [...admin, pricing, { id: 'about', labelKey: 'profileAbout', route: 'Terms' }, ...SHARED_MENU_ITEMS]
}
