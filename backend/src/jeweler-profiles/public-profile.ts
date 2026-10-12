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

/**
 * Public shape of a jeweler business listing: exact coordinates are coarsened and an attached
 * logo upload is reduced to its id and type (storage location and owner stay internal).
 */
export function toPublicJewelerProfile<
  T extends Pick<JewelerProfile, 'latitude' | 'longitude'> & { logoUpload?: { id: string; mimeType: string } | null },
>(profile: T) {
  const { latitude, longitude, logoUpload, ...rest } = profile;
  return {
    ...rest,
    latitude: coarse(latitude),
    longitude: coarse(longitude),
    logoUpload: logoUpload ? { id: logoUpload.id, mimeType: logoUpload.mimeType } : null,
  };
}
