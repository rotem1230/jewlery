import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Review, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { PrismaService } from '../database/prisma.service';
import { CreateReviewDto, QueryReviewsDto } from './dto/review.dto';

const PAGE_SIZE = 20;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async recomputeAggregates(jewelerProfileId: string): Promise<void> {
    const aggregate = await this.prisma.review.aggregate({
      where: { jewelerProfileId },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await this.prisma.jewelerProfile.update({
      where: { id: jewelerProfileId },
      data: {
        ratingAvg: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count._all,
      },
    });
  }

  async create(user: User, dto: CreateReviewDto): Promise<Review> {
    const profile = await this.prisma.jewelerProfile.findUnique({ where: { id: dto.jewelerProfileId } });
    if (!profile) {
      throw new NotFoundException({ success: false, message: 'Jeweler profile not found' });
    }

    const review = await this.prisma.review.create({
      data: {
        jewelerProfileId: dto.jewelerProfileId,
        authorUserId: user.id,
        reviewerName: dto.reviewerName,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    await this.recomputeAggregates(dto.jewelerProfileId);
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
    const where: Prisma.ReviewWhereInput = { jewelerProfileId: query.jewelerProfileId };

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  async feature(id: string, isFeatured: boolean, user: User): Promise<Review> {
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

    const updated = await this.prisma.review.update({ where: { id }, data: { isFeatured } });

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
