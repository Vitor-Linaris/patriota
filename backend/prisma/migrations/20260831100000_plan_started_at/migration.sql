-- When a subscription began.
--
-- No existing column answers "how many new subscribers this month":
-- "planRenewsAt" moves forward on every renewal, and "createdAt" is when
-- the account was opened, which for most subscribers is months earlier.
ALTER TABLE "Reader" ADD COLUMN "planStartedAt" TIMESTAMP(3);

-- Rows that predate the column. "updatedAt" is the closest thing to the
-- truth we have — for a reader who has been PREMIUM for a while it is
-- roughly when somebody last touched their plan. An approximation is
-- better than a NULL that silently drops them out of every count, and
-- the alternative is inventing a date.
UPDATE "Reader" SET "planStartedAt" = "updatedAt" WHERE "plan" = 'PREMIUM';

-- Every subscription figure on the dashboard is "plan = PREMIUM AND the
-- end date has not passed". The plain index on "plan" added last
-- migration cannot serve the date half; this one can, and supersedes it.
DROP INDEX IF EXISTS "Reader_plan_idx";
CREATE INDEX "Reader_plan_planRenewsAt_idx" ON "Reader"("plan", "planRenewsAt");
