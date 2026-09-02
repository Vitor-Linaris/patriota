-- Stripe billing.
--
-- "StripeEvent" is the idempotency ledger. Stripe delivers each webhook
-- AT LEAST once and retries until it gets a 2xx, so the same event
-- arrives more than once as a matter of course. Recording the id inside
-- the same transaction as the change it authorises turns a repeat
-- delivery into a unique-constraint violation instead of a second
-- subscription extension.
CREATE TABLE "StripeEvent" (
  "id"         TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "readerId"   TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StripeEvent_receivedAt_idx" ON "StripeEvent"("receivedAt");

-- The subscription behind a paid plan. Unique because one Stripe
-- subscription belongs to exactly one reader, and a duplicate would mean
-- two accounts fed by the same webhook.
ALTER TABLE "Reader" ADD COLUMN "stripeSubscriptionId" TEXT;

CREATE UNIQUE INDEX "Reader_stripeSubscriptionId_key"
  ON "Reader"("stripeSubscriptionId");
