-- A newsletter subscription becomes something only its owner can act on.
--
-- The row was keyed by an address and nothing else, so the address WAS
-- the authorisation: the public endpoint cancelled, or reactivated, any
-- subscription for anybody who typed the e-mail into the form. The token
-- moves that authority into something only the owner of the inbox
-- receives -- the same mechanism Reader.unsubscribeToken already uses.
--
-- Backfilled with gen_random_uuid() (pgcrypto ships in the contrib set
-- Postgres 13+ enables by default) so existing rows get a distinct,
-- unguessable value rather than sharing a default.
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "manageToken" TEXT;

UPDATE "NewsletterSubscriber"
   SET "manageToken" = replace(gen_random_uuid()::text, '-', '')
 WHERE "manageToken" IS NULL;

ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "manageToken" SET NOT NULL;

CREATE UNIQUE INDEX "NewsletterSubscriber_manageToken_key"
    ON "NewsletterSubscriber"("manageToken");
