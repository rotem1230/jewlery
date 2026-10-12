import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DesignStatus, Prisma, ProfilePublishStatus, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { PrismaService } from '../database/prisma.service';
import { PUBLIC_REVIEW_SELECT } from '../jeweler-profiles/public-profile';
import { CreateReviewDto, QueryReviewsDto } from './dto/review.dto';

const PAGE_SIZE = 20;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async recomputeAggregates(tx: Prisma.TransactionClient, jewelerProfileId: string): Promise<void> {
    const aggregate = await tx.review.aggregate({
      where: { jewelerProfileId },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await tx.jewelerProfile.update({
      where: { id: jewelerProfileId },
      data: {
        ratingAvg: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count._all,
      },
    });
  }

  /**
   * Only a designer whose design this jeweler completed (accepted quote) may review, once per
   * jeweler. The rating drives marketplace ranking, so self-reviews and repeat reviews are refused.
   */
  async create(user: User, dto: CreateReviewDto) {
    const profile = await this.prisma.jewelerProfile.findFirst({
      where: { id: dto.jewelerProfileId, publishStatus: ProfilePublishStatus.PUBLISHED },
    });
    if (!profile) {
      throw new NotFoundException({ success: false, message: 'Jeweler profile not found' });
    }
    const notEligible = new ForbiddenException({
      success: false,
      message: 'Only customers with a completed order from this jeweler can review',
      code: 'REVIEW_NOT_ELIGIBLE',
    });
    if (profile.userId === user.id) {
      throw notEligible;
    }
    const completedDeal = await this.prisma.design.findFirst({
      where: { ownerUserId: user.id, completedByJewelerId: profile.userId, status: DesignStatus.COMPLETED },
      select: { id: true },
    });
    if (!completedDeal) {
      throw notEligible;
    }

    let review;
    try {
      review = await this.prisma.$transaction(async (tx) => {
        // Profile row first: inserting takes a key-share lock on it (foreign key), so locking it
        // only afterwards made two simultaneous reviews of one jeweler deadlock.
        await tx.$queryRaw`SELECT id FROM "jeweler_profiles" WHERE id = ${dto.jewelerProfileId}::uuid FOR UPDATE`;
        const created = await tx.review.create({
          data: {
            jewelerProfileId: dto.jewelerProfileId,
            authorUserId: user.id,
            reviewerName: dto.reviewerName,
            rating: dto.rating,
            comment: dto.comment,
          },
          select: PUBLIC_REVIEW_SELECT,
        });
        await this.recomputeAggregates(tx, dto.jewelerProfileId);
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          success: false,
          message: 'You already reviewed this jeweler',
          code: 'REVIEW_EXISTS',
        });
      }
      throw err;
    }

    await this.audit.log({
      actorUserId: user.id,
      action: 'review.create',
      entityType: 'Review',
      entityId: review.id,
      after: toJsonValue(review),
    });

    return review;
  }

  async findMany(query: QueryReviewsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const where: Prisma.ReviewWhereInput = {
      jewelerProfileId: query.jewelerProfileId,
      profile: { publishStatus: ProfilePublishStatus.PUBLISHED, user: { deletedAt: null } },
    };

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: PUBLIC_REVIEW_SELECT,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  async feature(id: string, isFeatured: boolean, user: User) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { profile: { select: { userId: true } } },
    });
    if (!review) {
      throw new NotFoundException({ success: false, message: 'Review not found' });
    }
    if (review.profile.userId !== user.id) {
      throw new ForbiddenException({ success: false, message: 'Not the jeweler profile owner' });
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: { isFeatured },
      select: PUBLIC_REVIEW_SELECT,
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'review.feature',
      entityType: 'Review',
      entityId: id,
      after: { isFeatured },
    });

    return updated;
  }
}
