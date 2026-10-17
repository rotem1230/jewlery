import { Prisma, UploadStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UploadAccessService } from '../uploads/upload-access.service';

type SignsUploads = Pick<UploadAccessService, 'urlFor'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A design as the screens picture it: `previewUrl` is a signed link to the server-rendered picture
 * of exactly this design (null until one is rendered). The upload id itself stays internal.
 */
export function withDesignPreview<T extends { previewUploadId: string | null }>(
  design: T,
  access: SignsUploads,
): Omit<T, 'previewUploadId'> & { previewUrl: string | null } {
  const { previewUploadId, ...rest } = design;
  return { ...rest, previewUrl: access.urlFor(previewUploadId) };
}

/**
 * The inspiration picture a design was briefed with (`parameters.inspirationUploadId`, PRD 5.4),
 * as a signed link for the jewelers pricing it. Only the design owner's own, ready image is
 * signed: an id naming anyone else's file (e.g. a private chat picture) is never handed out.
 */
export async function inspirationUrlFor(
  prisma: PrismaService,
  access: SignsUploads,
  design: { ownerUserId: string; parameters: Prisma.JsonValue },
): Promise<string | null> {
  const parameters = design.parameters;
  const uploadId =
    parameters && typeof parameters === 'object' && !Array.isArray(parameters)
      ? (parameters as Prisma.JsonObject).inspirationUploadId
      : undefined;
  if (typeof uploadId !== 'string' || !UUID.test(uploadId)) {
    return null;
  }
  const upload = await prisma.upload.findFirst({
    where: {
      id: uploadId,
      ownerUserId: design.ownerUserId,
      deletedAt: null,
      status: UploadStatus.READY,
      mimeType: { startsWith: 'image/' },
    },
    select: { id: true },
  });
  return upload ? access.urlFor(upload.id) : null;
}
