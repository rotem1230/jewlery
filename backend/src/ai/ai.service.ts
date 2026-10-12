import { Inject, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AiGenerationJob, JobStatus, User, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toJsonValue } from '../audit/json.util';
import { OutboxService } from '../common/outbox/outbox.service';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AI_ENGINE_ADAPTER, AiEngineAdapter } from './adapters/ai-engine.adapter';
import { CreateAiInspirationDto } from './dto/ai.dto';

const GLB_MIME = 'model/gltf-binary';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly uploads: UploadsService,
    @Inject(AI_ENGINE_ADAPTER)
    private readonly engine: AiEngineAdapter,
  ) {}

  async createInspiration(user: User, dto: CreateAiInspirationDto): Promise<AiGenerationJob> {
    let itemCode = 'RING';
    if (dto.designId) {
      const design = await this.prisma.design.findFirst({
        where: { id: dto.designId, deletedAt: null },
        include: { itemType: { select: { code: true } } },
      });
      if (!design) {
        throw new NotFoundException({ success: false, message: 'Design not found' });
      }
      if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
        throw new ForbiddenException({ success: false, message: 'Not the design owner' });
      }
      itemCode = design.itemType.code;
    }

    const job = await this.prisma.aiGenerationJob.create({
      data: {
        designId: dto.designId ?? null,
        requestedById: user.id,
        prompt: dto.prompt,
        status: JobStatus.QUEUED,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'ai.inspiration_request',
      entityType: 'AiGenerationJob',
      entityId: job.id,
      after: toJsonValue(job),
    });

    return this.process(job, itemCode, user.id);
  }

  /**
   * Adapter writes a GLB we host in Uploads. Tripo URLs are downloaded immediately
   * (they expire in ~5 minutes) and never returned to the client.
   */
  private async process(job: AiGenerationJob, itemCode: string, ownerUserId: string): Promise<AiGenerationJob> {
    await this.prisma.aiGenerationJob.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING },
    });

    try {
      const generated = await this.engine.generate({ prompt: job.prompt, itemCode });
      const upload = await this.uploads.createGeneratedLocal(ownerUserId, generated.glb, GLB_MIME);

      const succeeded = await this.prisma.aiGenerationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.SUCCEEDED, outputUploadId: upload.id, finishedAt: new Date() },
      });

      await this.outbox.enqueue('ai.completed', {
        aiJobId: succeeded.id,
        designId: succeeded.designId,
        status: succeeded.status,
        providerRef: generated.providerRef,
      });

      return succeeded;
    } catch (err) {
      return this.prisma.aiGenerationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, errorMessage: (err as Error).message, finishedAt: new Date() },
      });
    }
  }

  async findOne(id: string, user: User): Promise<AiGenerationJob> {
    const job = await this.prisma.aiGenerationJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException({ success: false, message: 'AI job not found' });
    }
    if (job.requestedById !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not the job owner' });
    }
    return job;
  }
}
