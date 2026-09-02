-- The media owner, promoted from a bare string to a real relation.
--
-- "uploadedById" has been written on every upload since the column
-- existed, but never read: no index, no foreign key, no filter. The
-- per-user library is about to read it on every page load.

-- Any id pointing at a user who has since been deleted would violate
-- the constraint below. Cleared first, deliberately: those rows become
-- ownerless and fall back to the SUPER_ADMIN's view, which is where
-- media from departed staff belongs anyway.
UPDATE "Media" m
   SET "uploadedById" = NULL
 WHERE m."uploadedById" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = m."uploadedById");

-- ON DELETE SET NULL, never CASCADE. Deleting a journalist must not
-- delete the photographs their published articles still point at — the
-- article holds a URL string, not a foreign key, so the file would 404
-- with nothing to explain why.
ALTER TABLE "Media"
  ADD CONSTRAINT "Media_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- "my library, newest first" is now the shape of every listing.
CREATE INDEX "Media_uploadedById_uploadedAt_idx"
  ON "Media"("uploadedById", "uploadedAt");
