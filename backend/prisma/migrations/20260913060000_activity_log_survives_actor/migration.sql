-- O rasto de auditoria passa a sobreviver à conta que audita.
--
-- Antes: ActivityLog.userId era obrigatório com onDelete: Cascade, e o
-- UsersService.remove() ainda apagava explicitamente as linhas antes de
-- apagar o utilizador. Apagar uma conta de staff destruía todo o registo
-- do que essa conta tinha feito — e as contas mais fáceis de apagar são
-- precisamente as que não têm artigos a bloquear (MODERADOR, ANALISTA),
-- cujo rasto é suspensões de leitores, ofertas de assinatura e concessões
-- de pacotes. Não há segunda tabela de auditoria nem exportação desta.
--
-- Ordem importa: a coluna tem de ser preenchida antes de ficar NOT NULL.

-- 1. Coluna nova, permissiva, para poder preencher o histórico.
ALTER TABLE "ActivityLog" ADD COLUMN "actorLabel" TEXT;

-- 2. Preencher a partir da relação que ainda existe. Depois desta
--    migração o userId pode ficar NULL, e então só o actorLabel diz
--    quem agiu.
UPDATE "ActivityLog" AS a
SET "actorLabel" = u."name" || ' <' || u."email" || '>'
FROM "User" AS u
WHERE a."userId" = u."id";

-- 3. Rede de segurança para linhas cujo utilizador já não exista (não
--    deveria haver nenhuma, dado que o FK era obrigatório, mas uma
--    migração que assume isso e se engana deixa a coluna NULL e falha
--    no passo seguinte sem dizer porquê).
UPDATE "ActivityLog"
SET "actorLabel" = '(conta removida: ' || "userId" || ')'
WHERE "actorLabel" IS NULL;

-- 4. Agora sim, obrigatória.
ALTER TABLE "ActivityLog" ALTER COLUMN "actorLabel" SET NOT NULL;

-- 5. userId passa a opcional e a relação passa de Cascade para SetNull.
ALTER TABLE "ActivityLog" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_userId_fkey";

ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
