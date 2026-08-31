-- Pending edits to an already-published article.
--
-- Editing a live piece must not take it off the site. These three
-- columns hold the work-in-progress while the real columns keep serving
-- readers; promoting the draft is an explicit publish, never a side
-- effect of someone typing and walking away.
--
-- All nullable / defaulted, so every existing row is valid as-is:
-- draft IS NULL means "what you see is what is live", which is true of
-- every article that exists today.
ALTER TABLE "Article"
  ADD COLUMN "draft"               JSONB,
  ADD COLUMN "draftUpdatedAt"      TIMESTAMP(3),
  ADD COLUMN "draftAwaitingReview" BOOLEAN NOT NULL DEFAULT false;

-- The approval queue filters on this on every load.
CREATE INDEX "Article_draftAwaitingReview_idx"
  ON "Article"("draftAwaitingReview");
