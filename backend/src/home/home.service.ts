import { Injectable } from '@nestjs/common';
import { DesignStatus, RequestTargetStatus, User, UserRole } from '@prisma/client';
import { effectiveOrderStatus, IN_PROGRESS_ORDER_STATUSES, OPEN_REQUEST_STATUSES } from '../atelier/order-status';
import { AppConfigService } from '../cms/app-config.service';
import { PrismaService } from '../database/prisma.service';

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

    const now = new Date();
    const [newRequests, inProgress, recentTargets] = await Promise.all([
      // New: not acted on yet, on a request still open for a listing still live.
      this.prisma.designRequestTarget.count({
        where: {
          jewelerProfileId: profile.id,
          status: RequestTargetStatus.NEW,
          request: {
            status: { in: OPEN_REQUEST_STATUSES },
            design: { status: DesignStatus.PUBLISHED, deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          },
        },
      }),
      this.prisma.designRequestTarget.count({
        where: { jewelerProfileId: profile.id, status: { in: IN_PROGRESS_ORDER_STATUSES } },
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
                  status: true,
                  expiresAt: true,
                  deletedAt: true,
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
        myStatus: effectiveOrderStatus(target.status, target.request.status, target.request.design),
        deliveredAt: target.deliveredAt,
        design: target.request.design,
      })),
    };
  }
}
