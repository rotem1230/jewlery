-- A design's preview picture is keyed by what it was rendered from (the parametric spec and the
-- renderer version), so edits that do not change the piece (title, notes, publishing) keep it.

SET LOCAL lock_timeout = '10s';

-- AlterTable (nullable column: no table rewrite)
ALTER TABLE "designs" ADD COLUMN     "previewKey" TEXT;
