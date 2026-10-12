import { Prisma } from '@prisma/client';
import { DEFAULT_UPLOAD_LIMITS } from '../uploads/uploads.constants';

/** Config keys considered safe to expose via the unauthenticated public endpoint. */
export const PUBLIC_CONFIG_KEYS = [
  'password_policy',
  'upload_limits',
  'lead_definition',
  'marketplace_publish_ttl_days',
  'home_designer',
  'home_jeweler',
] as const;

export type DefaultConfigEntry = {
  key: string;
  value: Prisma.InputJsonValue;
};

/** Default rows seeded on first boot / `prisma db seed`. See docs/backend-contracts.md. */
export const DEFAULT_APP_CONFIGS: DefaultConfigEntry[] = [
  {
    key: 'password_policy',
    value: { minLength: 8, requireLetter: true, requireNumber: true },
  },
  {
    key: 'upload_limits',
    value: { ...DEFAULT_UPLOAD_LIMITS },
  },
  {
    key: 'token_ttls',
    value: { emailVerifyMinutes: 60 * 24, passwordResetMinutes: 30 },
  },
  {
    key: 'lockout',
    value: { maxAttempts: 5, lockMinutes: 15 },
  },
  {
    key: 'lead_definition',
    value: { mode: 'design_request_delivery' },
  },
  {
    key: 'require_feasibility_before_publish',
    value: false,
  },
  {
    key: 'require_admin_approval_before_profile_publish',
    value: false,
  },
  {
    key: 'marketplace_publish_ttl_days',
    value: 30,
  },
  {
    key: 'home_designer',
    value: { blocks: [] },
  },
  {
    key: 'home_jeweler',
    value: { blocks: [] },
  },
  {
    key: 'viz_retention_hours',
    value: 72,
  },
  {
    key: 'ranking_weights',
    value: { organicWeight: 1, sponsoredWeight: 1.5 },
  },
  {
    key: 'promotion_caps',
    value: { maxSponsoredPerPage: 3, maxSponsoredRatio: 0.34 },
  },
  {
    key: 'matching_weights',
    value: { regionMatchWeight: 50, specialtyOverlapWeight: 10 },
  },
];
