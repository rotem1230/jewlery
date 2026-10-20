import { Injectable } from '@nestjs/common';
import { ContentPageStatus, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** The CMS page holding the terms of use and privacy policy; Hebrew is the binding text. */
export const TERMS_SLUG = 'tos';
export const TERMS_LOCALE = 'he';

export type ConsentSource = 'signup' | 'signup_older_app' | 'oauth_signup' | 'preferences';

/** What the sign-up screen sends: the terms box (required), the version shown, the marketing box. */
export type SignupConsent = { acceptTerms?: boolean; termsVersion?: number; marketingConsent?: boolean };

/** Where a decision was made from (kept as evidence with it). */
export type ConsentContext = { ip?: string | null; userAgent?: string | null };

const MAX_USER_AGENT = 300;

/**
 * Evidence of what each user agreed to (click-wrap): the terms of use and privacy policy, with the
 * version accepted, and — separately, as the anti-spam law asks — marketing messages. Every call
 * runs inside the caller's transaction, so an account is never created without its consent rows.
 */
@Injectable()
export class ConsentsService {
  /** At sign-up: the terms (accepted: the app does not let an account be created otherwise) and the marketing choice. */
  async recordSignup(tx: Tx, userId: string, consent: SignupConsent, source: ConsentSource, context: ConsentContext): Promise<void> {
    const documentVersion = await this.termsVersion(tx, consent.termsVersion);
    const marketing = consent.marketingConsent === true;
    const where = whereFrom(context);
    await tx.userConsent.createMany({
      data: [
        { userId, kind: 'TERMS', granted: true, documentVersion, source, ...where },
        { userId, kind: 'MARKETING', granted: marketing, documentVersion: null, source, ...where },
      ],
    });
    if (marketing) {
      await tx.userPreference.upsert({
        where: { userId },
        create: { userId, notifyMarketingEnabled: true },
        update: { notifyMarketingEnabled: true },
      });
    }
  }

  /** A change of the marketing choice made later (the preferences screen). */
  async recordMarketing(tx: Tx, userId: string, granted: boolean, source: ConsentSource, context: ConsentContext = {}): Promise<void> {
    await tx.userConsent.create({ data: { userId, kind: 'MARKETING', granted, documentVersion: null, source, ...whereFrom(context) } });
  }

  /**
   * The version accepted: the one the app showed when it is a published version, otherwise the
   * version published now (an older app sends none). Null only when no terms are published.
   */
  private async termsVersion(tx: Tx, shown: number | undefined): Promise<number | null> {
    const published = await tx.contentPage.findMany({
      where: { slug: TERMS_SLUG, locale: TERMS_LOCALE, status: ContentPageStatus.PUBLISHED },
      select: { version: true },
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
    });
    if (shown !== undefined && published.some((page) => page.version === shown)) return shown;
    return published[0]?.version ?? null;
  }
}

function whereFrom(context: ConsentContext): { ip: string | null; userAgent: string | null } {
  return { ip: context.ip || null, userAgent: context.userAgent ? context.userAgent.slice(0, MAX_USER_AGENT) : null };
}
