-- Uploaded and generated files can be kept in the database (STORAGE_DRIVER=database), so they
-- survive deploys and restarts on hosts without a persistent disk. Each design also keeps a
-- server-rendered picture of its current parameters (the same geometry as its STL export).

SET LOCAL lock_timeout = '10s';

-- AlterTable (nullable columns: no table rewrite)
ALTER TABLE "designs" ADD COLUMN     "previewUploadId" UUID,
ADD COLUMN     "previewVersion" INTEGER;

-- CreateTable
CREATE TABLE "upload_blobs" (
    "uploadId" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_blobs_pkey" PRIMARY KEY ("uploadId")
);

-- CreateIndex
CREATE INDEX "designs_previewUploadId_idx" ON "designs"("previewUploadId");

-- AddForeignKey
ALTER TABLE "upload_blobs" ADD CONSTRAINT "upload_blobs_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_previewUploadId_fkey" FOREIGN KEY ("previewUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
