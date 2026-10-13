import { Prisma } from '@prisma/client';

/** The design as a quote shows it (PRD 5.6): its item type and the specification the quote priced. */
export const QUOTE_DESIGN_SELECT = {
  id: true,
  title: true,
  thumbnailUploadId: true,
  status: true,
  parameters: true,
  itemType: { select: { code: true, labelHe: true, labelEn: true } },
} satisfies Prisma.DesignSelect;

/** The quote's author as the designer sees them: by their business name. */
export const QUOTE_AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  jewelerProfile: { select: { businessName: true } },
} satisfies Prisma.UserSelect;

export function withBusinessName<T extends { jewelerProfile: { businessName: string } | null }>(author: T) {
  const { jewelerProfile, ...rest } = author;
  return { ...rest, businessName: jewelerProfile?.businessName ?? null };
}
