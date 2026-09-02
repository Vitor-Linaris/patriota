-- Reader suspension detail.
--
-- `Reader.status = 'SUSPENSO'` already existed and is still the flag that
-- every checkpoint reads first. These three columns are the rest of the
-- story: until when, why, and by whom.
--
-- NULL "suspendedUntil" on a SUSPENSO reader means permanent. A date in
-- the future is a temporary ban that lapses by comparison, with no job
-- to run and nothing to remember.
ALTER TABLE "Reader"
  ADD COLUMN "suspendedUntil"   TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT,
  ADD COLUMN "suspendedById"    TEXT;

-- ON DELETE SET NULL, not CASCADE: a moderator leaving the newsroom must
-- never take the readers they banned back out of suspension with them.
ALTER TABLE "Reader"
  ADD CONSTRAINT "Reader_suspendedById_fkey"
  FOREIGN KEY ("suspendedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Reader_suspendedById_idx" ON "Reader"("suspendedById");
