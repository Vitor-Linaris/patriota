-- Subscriptions given by hand.
--
-- "planRenewsAt" already existed and keeps its column; what it means is
-- now written down: the date the current entitlement ENDS, whether that
-- end is a Stripe renewal or the expiry an admin chose. NULL means no
-- end date. It is read by comparison, like a suspension — a plan that
-- has lapsed reads as GRATIS on the next request, with nothing to run.
CREATE TYPE "PlanSource" AS ENUM ('MANUAL', 'STRIPE');

ALTER TABLE "Reader"
  ADD COLUMN "planSource"      "PlanSource",
  ADD COLUMN "planGrantedById" TEXT,
  ADD COLUMN "planNote"        TEXT;

-- ON DELETE SET NULL: an admin leaving the newsroom must not revoke the
-- subscriptions they handed out on the way past.
ALTER TABLE "Reader"
  ADD CONSTRAINT "Reader_planGrantedById_fkey"
  FOREIGN KEY ("planGrantedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Reader_planGrantedById_idx" ON "Reader"("planGrantedById");

-- Counting subscribers is about to become a thing the dashboard does on
-- every load, and today it is a full table scan.
CREATE INDEX "Reader_plan_idx" ON "Reader"("plan");

-- Any reader already on PREMIUM predates this column. There is no Stripe
-- integration yet, so whatever put them there was a hand edit.
UPDATE "Reader" SET "planSource" = 'MANUAL' WHERE "plan" = 'PREMIUM';
