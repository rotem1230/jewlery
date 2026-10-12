import { JewelerProfile, Prisma } from '@prisma/client';

/** Review fields safe for anonymous readers (no author account id). */
export const PUBLIC_REVIEW_SELECT = {
  id: true,
  jewelerProfileId: true,
  reviewerName: true,
  rating: true,
  comment: true,
  isFeatured: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

export const PUBLIC_PORTFOLIO_SELECT = {
  id: true,
  profileId: true,
  uploadId: true,
  title: true,
  sortOrder: true,
  isSelectedWork: true,
  createdAt: true,
} satisfies Prisma.PortfolioItemSelect;

/** ~1 km: enough for "near me" ordering without pinpointing a home workshop. */
function coarse(value: Prisma.Decimal | number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Math.round(Number(value) * 100) / 100;
}

type PublicProfileSource<TRegion, TPortfolio, TReview> = JewelerProfile & {
  region?: TRegion;
  logoUpload?: { id: string; mimeType: string } | null;
  portfolio?: TPortfolio[];
  reviews?: TReview[];
};

/**
 * Public shape of a jeweler business listing, built from an allow-list so a new column is never
 * published by accident. Contact details (phone, e-mail) are not part of it: they reach a
 * customer through the handoff after a quote is accepted. Exact coordinates are coarsened and
 * an attached logo upload is reduced to its id and type.
 */
export function toPublicJewelerProfile<TRegion, TPortfolio, TReview>(
  profile: PublicProfileSource<TRegion, TPortfolio, TReview>,
) {
  return {
    id: profile.id,
    userId: profile.userId,
    businessName: profile.businessName,
    regionId: profile.regionId,
    specialties: profile.specialties,
    bio: profile.bio,
    businessHours: profile.businessHours,
    serviceAreaText: profile.serviceAreaText,
    ratingAvg: profile.ratingAvg,
    reviewCount: profile.reviewCount,
    verifiedBadge: profile.verifiedBadge,
    publishedAt: profile.publishedAt,
    latitude: coarse(profile.latitude),
    longitude: coarse(profile.longitude),
    logoUploadId: profile.logoUploadId,
    logoUpload: profile.logoUpload ? { id: profile.logoUpload.id, mimeType: profile.logoUpload.mimeType } : null,
    ...(profile.region !== undefined ? { region: profile.region } : {}),
    ...(profile.portfolio !== undefined ? { portfolio: profile.portfolio } : {}),
    ...(profile.reviews !== undefined ? { reviews: profile.reviews } : {}),
  };
}
