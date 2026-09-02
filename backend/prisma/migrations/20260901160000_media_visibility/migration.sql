-- Media becomes private by default, and public once it is used in
-- something published.
--
-- The narrower promise, said plainly: a published article has to serve
-- its images to readers with no session, to Googlebot, and to whatever
-- builds the preview when somebody shares the link. None of those
-- authenticate. So "private" covers material that has not run yet — an
-- embargoed photograph, a draft graphic — and stops the moment the
-- piece does.
CREATE TYPE "MediaVisibility" AS ENUM ('PRIVADO', 'PUBLICO');

-- Added as PUBLICO so that at no point during this migration is a live
-- image unreachable. The default flips to PRIVADO at the end, once the
-- existing rows have been classified.
ALTER TABLE "Media"
  ADD COLUMN "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLICO',
  ADD COLUMN "storageKey" TEXT;

-- "YYYY/MM/<baseId>", pulled out of the canonical URL. The three
-- variants share it and differ only by the -large/-medium/-small
-- suffix, so one key identifies the whole set.
--
-- Pasted external URLs do not match the pattern and stay NULL: they are
-- not files we serve, and nothing about them is ours to gate.
UPDATE "Media"
   SET "storageKey" = substring("url" from '([0-9]{4}/[0-9]{2}/[0-9a-f]+)-large\.webp$');

CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- Now the classification. Anything referenced by a PUBLISHED article or
-- an ENABLED ad stays public; everything else becomes private.
--
-- Matched by URL string, not by a foreign key, because that is the only
-- link that exists — an article stores the address of its cover image,
-- and inline images live inside the HTML. It is the same cross-check
-- media.service.ts already uses to decide whether a file is in use.
UPDATE "Media" m
   SET "visibility" = 'PRIVADO'
 WHERE NOT EXISTS (
   SELECT 1 FROM "Article" a
    WHERE a."status" = 'PUBLICADO'
      AND (
        a."coverImageUrl" IN (m."url", m."urlMedium", m."urlSmall")
        OR a."content" LIKE '%' || m."url" || '%'
        OR (m."urlMedium" IS NOT NULL AND a."content" LIKE '%' || m."urlMedium" || '%')
        OR (m."urlSmall"  IS NOT NULL AND a."content" LIKE '%' || m."urlSmall"  || '%')
      )
 )
   AND NOT EXISTS (
   SELECT 1 FROM "Ad" d
    WHERE d."enabled" = true
      AND d."imageUrl" IN (m."url", m."urlMedium", m."urlSmall")
 );

-- New uploads are private until something publishes them.
ALTER TABLE "Media" ALTER COLUMN "visibility" SET DEFAULT 'PRIVADO';

-- The serving route reads visibility by storageKey; the library lists
-- by owner. Neither wants a scan.
CREATE INDEX "Media_visibility_idx" ON "Media"("visibility");
