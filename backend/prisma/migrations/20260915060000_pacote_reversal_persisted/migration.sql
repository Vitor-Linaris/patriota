-- Uma reversão de pagamento passa a ficar registada na base de dados, não
-- só no log.
--
-- Antes, o onChargeRefunded() escrevia uma linha de log e mais nada: a
-- compra ficava PAGO com revokedAt a NULL, portanto a tabela de compras do
-- admin mostrava um reembolso como uma linha verde igual às outras e o
-- "Os meus pacotes" do leitor continuava a listar o pacote. O controlo
-- compensatório que o código nomeava — uma pessoa carregar em "Revogar
-- compra" — precisa que essa pessoa seja avisada de que há uma decisão a
-- tomar. E o charge.dispute.* não tinha case nenhum no switch, caindo no
-- default sem sequer uma linha de log.
--
-- Colunas novas, todas opcionais: nenhuma linha existente precisa de valor.

ALTER TABLE "PackagePurchase" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "PackagePurchase" ADD COLUMN "refundedAmountCents" INTEGER;
ALTER TABLE "PackagePurchase" ADD COLUMN "disputedAt" TIMESTAMP(3);
