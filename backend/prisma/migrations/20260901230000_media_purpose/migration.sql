-- Splits ad banners out of the newsroom library.
--
-- A banner belongs to one ad slot: it is replaced when the campaign
-- changes and is of no use to anybody writing an article. Keeping it in
-- the shared library meant a journalist scrolling past other people's
-- advertising, and — worse — an ad image being subject to the library's
-- deletion rule ("refuse while anything uses it") when what the ad
-- manager actually needs is to throw it away and put another one up.

CREATE TYPE "MediaPurpose" AS ENUM ('EDITORIAL', 'PUBLICIDADE');

ALTER TABLE "Media"
  ADD COLUMN "purpose" "MediaPurpose" NOT NULL DEFAULT 'EDITORIAL';

-- Backfill: anything an ad slot points at is advertising.
--
-- Matched against all three variant URLs because an ad stores whichever
-- one it was given, and by URL text rather than a foreign key because
-- that is how media has always been tied to what uses it — there is no
-- relation to join on.
--
-- Deliberately NOT restricted to enabled ads: a banner sitting in a
-- disabled slot is still a banner, and leaving it in the library is the
-- exact thing this migration removes.
UPDATE "Media" m
SET "purpose" = 'PUBLICIDADE'
WHERE EXISTS (
  SELECT 1 FROM "Ad" a
  WHERE a."imageUrl" IS NOT NULL
    AND a."imageUrl" IN (m."url", m."urlMedium", m."urlSmall")
);

-- One caveat, left as it is on purpose: an image used by BOTH an
-- article and an ad becomes PUBLICIDADE here and leaves the library.
-- It is rare, it is recoverable (the column is one UPDATE away), and
-- the alternative — leaving it editorial — would let the ad screen's
-- permanent delete reach a file a published article depends on. The
-- delete path checks for that too; this is the second lock on the same
-- door.

CREATE INDEX "Media_purpose_uploadedById_uploadedAt_idx"
  ON "Media"("purpose", "uploadedById", "uploadedAt");
