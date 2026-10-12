import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';

/**
 * Marks an authenticated route that an account still in PENDING_VERIFICATION may call (reading
 * its own profile, signing out, deleting itself). Every other authenticated route refuses such
 * accounts with 403 EMAIL_NOT_VERIFIED.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
