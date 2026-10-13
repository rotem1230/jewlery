import { Prisma } from '@prisma/client';

/**
 * Where a design's parameters name a picture (PRD 5.4): the inspiration picture and the pictures
 * of custom elements (`elements[].customUploadId`), as the app's design studio stores them.
 */
export function designPictureReferences(uploadId: string): Prisma.DesignWhereInput[] {
  return [
    { parameters: { path: ['inspirationUploadId'], equals: uploadId } },
    { parameters: { path: ['elements'], array_contains: [{ customUploadId: uploadId }] } },
  ];
}
