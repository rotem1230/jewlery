import { Prisma } from '@prisma/client';
import { withDesignPreview } from '../atelier/design-pictures';
import { UploadAccessService } from '../uploads/upload-access.service';

/**
 * The design as a quote shows it (PRD 5.6): its item type, the specification the quote priced and
 * its rendered picture (signed as `previewUrl` by withDesignPreview / withQuoteDesignPreview).
 */
export const QUOTE_DESIGN_SELECT = {
  id: true,
  title: true,
  thumbnailUploadId: true,
  previewUploadId: true,
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

/** A chat message with its quote card's design pictured (a message without a quote is unchanged). */
export function withQuoteDesignPreview<
  M extends { quote: { design: { previewUploadId: string | null } } | null },
>(message: M, access: Pick<UploadAccessService, 'urlFor'>) {
  const { quote } = message;
  return {
    ...message,
    quote: quote ? { ...quote, design: withDesignPreview(quote.design, access) } : null,
  };
}
