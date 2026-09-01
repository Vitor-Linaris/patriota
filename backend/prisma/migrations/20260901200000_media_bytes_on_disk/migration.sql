-- What an upload actually occupies, for the per-person quota.
--
-- "size" holds only the LARGE variant — it is what the library shows
-- next to "Tamanho" and has to match the file somebody would download.
-- But every upload writes three files, so a quota counting "size" would
-- miss the small and medium ones: roughly a third of the disk, invisible.
ALTER TABLE "Media" ADD COLUMN "bytesOnDisk" INTEGER;

-- Existing rows are backfilled to "size", which UNDERCOUNTS them by the
-- two variants it cannot see. Deliberate: the real figure is only on
-- disk and SQL cannot go and look. Inventing a multiplier would be
-- worse — a made-up number that reads as measured. New uploads are
-- counted properly, and nobody is near the 2 GB allowance yet.
UPDATE "Media" SET "bytesOnDisk" = "size" WHERE "size" IS NOT NULL;

-- The quota sums this per owner on every upload.
CREATE INDEX "Media_uploadedById_bytesOnDisk_idx"
  ON "Media"("uploadedById", "bytesOnDisk");
