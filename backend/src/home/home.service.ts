import { Injectable } from '@nestjs/common';
import { DesignRequestStatus, User, UserRole } from '@prisma/client';
import { AppConfigService } from '../cms/app-config.service';
import { PrismaService } from '../database/prisma.service';

const IN_PROGRESS_STATUSES: DesignRequestStatus[] = [
  DesignRequestStatus.QUOTE_SUBMITTED,
  DesignRequestStatus.NEGOTIATING,
];

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  async getSummary(user: User) {
    if (user.activeRole === UserRole.JEWELER) {
      return this.jewelerSummary(user);
    }
    return this.designerSummary(user);
  }

  private async designerSummary(user: User) {
    const [blocks, recentDesigns, recentNotifications] = await Promise.all([
      this.appConfig.get('home_designer'),
      this.prisma.design.findMany({
        where: { ownerUserId: user.id, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { itemType: { select: { code: true, labelHe: true, labelEn: true } } },
      }),
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      role: UserRole.DESIGNER,
      blocks: blocks ?? { blocks: [] },
      recentDesigns,
      recentNotifications,
    };
  }

  private async jewelerSummary(user: User) {
    const profile = await this.prisma.jewelerProfile.findUnique({ where: { userId: user.id } });

    if (!profile) {
      return {
        role: UserRole.JEWELER,
        greeting: { name: user.firstName ?? null },
        newRequests: 0,
        inProgress: 0,
        recentRequests: [],
      };
    }

    const [newRequests, inProgress, recentTargets] = await Promise.all([
      this.prisma.designRequestTarget.count({
        where: { jewelerProfileId: profile.id, request: { status: DesignRequestStatus.OPEN } },
      }),
      this.prisma.designRequestTarget.count({
        where: { jewelerProfileId: profile.id, request: { status: { in: IN_PROGRESS_STATUSES } } },
      }),
      this.prisma.designRequestTarget.findMany({
        where: { jewelerProfileId: profile.id },
        orderBy: { deliveredAt: 'desc' },
        take: 5,
        include: {
          request: {
            include: {
              design: {
                select: {
                  id: true,
                  title: true,
                  thumbnailUploadId: true,
                  itemType: { select: { code: true, labelHe: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      role: UserRole.JEWELER,
      greeting: { name: user.firstName ?? null },
      newRequests,
      inProgress,
      recentRequests: recentTargets.map((target) => ({
        requestId: target.requestId,
        status: target.request.status,
        deliveredAt: target.deliveredAt,
        design: target.request.design,
      })),
    };
  }
}
