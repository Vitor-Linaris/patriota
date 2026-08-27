-- Category hierarchy: parentId + materialised path + depth.
--
-- Zero Article rows change. The 12 existing categories all become
-- depth-0 roots; the day after this runs, every page shows exactly what
-- it showed before — the only difference is that Subtopic rows are now
-- real, clickable Category children.

-- unaccent() is used below to slugify Subtopic labels the same way
-- slugify() in categories.service.ts effectively does (NFD normalise +
-- strip diacritics). Not installed by default on a fresh Postgres.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── 1. New columns, path nullable for now so the backfill below can run ──
ALTER TABLE "Category"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "path" TEXT,
  ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0;

-- Self-relation. RESTRICT, not CASCADE: deleting a category with
-- children must go through the service (which the future move/reorder
-- endpoint also uses to re-home a subtree first), never an accidental
-- cascade that wipes out a whole branch.
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. Backfill: every existing category is a root ──────────────────────
UPDATE "Category" SET "path" = '/' || "id" || '/' WHERE "parentId" IS NULL;

-- ── 3. Absorb Subtopic rows as real depth-1 categories ───────────────────
--
-- Subtopic was decorative: nothing filtered by it, Article has no
-- subtopicId. This is the whole migration story for the newsroom —
-- their existing subtopics ("Portugal" -> "Norte") become clickable
-- sections instead of dead label chips.
--
-- Slugs must stay globally unique (Category.slug @unique). Generated
-- from the label with the same normalise-and-hyphenate rule as
-- slugify() in categories.service.ts, suffixed with a short id fragment
-- to guarantee uniqueness without a second round-trip — two subtopics
-- named "Notícias" under different parents must not collide.
INSERT INTO "Category" (
  "id", "slug", "name", "description", "icon", "color",
  "order", "visible", "parentId", "depth", "path",
  "createdAt", "updatedAt"
)
SELECT
  s."id",
  lower(
    regexp_replace(
      regexp_replace(
        unaccent(s."label"),
        '[^a-zA-Z0-9]+', '-', 'g'
      ),
      '(^-|-$)', '', 'g'
    )
  ) || '-' || substr(s."id", 1, 6) AS "slug",
  s."label",
  '',
  c."icon",
  c."color",
  s."order",
  true,
  s."categoryId",
  1,
  c."path" || s."id" || '/',
  now(),
  now()
FROM "Subtopic" s
JOIN "Category" c ON c."id" = s."categoryId";

-- ── 4. path is now populated for every row ───────────────────────────────
ALTER TABLE "Category" ALTER COLUMN "path" SET NOT NULL;

-- Depth is enforced in CategoryTreeService (a subtree move needs the
-- parent row, which a bare CHECK can't see), but the constraint is a
-- backstop against a bad backfill or a future code path bypassing the
-- service.
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_depth_check" CHECK ("depth" BETWEEN 0 AND 3);

-- ── 5. Subtopic is fully absorbed ─────────────────────────────────────────
DROP TABLE "Subtopic";

-- ── 6. Indexes ─────────────────────────────────────────────────────────
CREATE INDEX "Category_parentId_order_idx" ON "Category"("parentId", "order");
CREATE INDEX "Category_path_idx" ON "Category"("path");
