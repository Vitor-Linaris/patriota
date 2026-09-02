-- Distingue "renova" de "termina" numa assinatura.
--
-- `planRenewsAt` significa "com direito até", e é a mesma data nos dois
-- casos: cancelar no Stripe deixa o estado `active` e só liga
-- `cancel_at_period_end`. Sem esta coluna, quem acabava de cancelar via
-- "Renova a 2 de outubro" — exactamente o contrário do que tinha pedido.

ALTER TABLE "Reader"
  ADD COLUMN "planCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "planCanceledAt" TIMESTAMP(3);

-- Backfill de uma assinatura oferecida à mão: nunca renova, por
-- construção — não há cartão por trás dela. A data de cancelamento fica
-- NULL, que é a verdade: ninguém a cancelou, tem apenas um fim marcado.
UPDATE "Reader"
SET "planCancelAtPeriodEnd" = true
WHERE "planSource" = 'MANUAL'
  AND "plan" = 'PREMIUM'
  AND "planRenewsAt" IS NOT NULL;

-- As do Stripe ficam em `false` e são corrigidas pelo próprio Stripe: a
-- primeira `customer.subscription.updated` de cada uma traz o valor
-- verdadeiro. Não dá para adivinhar aqui — a informação só existe lá.

CREATE INDEX "Reader_planCanceledAt_idx" ON "Reader"("planCanceledAt");
