-- O historico de moderacao de cada leitor.
--
-- Reader.suspensionReason guarda a razao da suspensao ACTUAL e mais
-- nada: levantar a suspensao apaga-a, e a suspensao seguinte escreve por
-- cima. Isso chega para saber o estado de alguem e nao chega para nada
-- mais -- um moderador que abre a fila de comentarios nao tem como saber
-- se aquela pessoa e um caso novo ou o terceiro aviso ao mesmo
-- individuo, que e exactamente a diferenca entre 15 dias e definitivo.
--
-- Uma linha por acto, e fica.
CREATE TYPE "ReaderSanctionKind" AS ENUM (
  'SUSPENSAO',
  'PERMANENTE',
  'LEVANTAMENTO'
);

CREATE TABLE "ReaderSanction" (
  "id"         TEXT NOT NULL,
  "readerId"   TEXT NOT NULL,
  "kind"       "ReaderSanctionKind" NOT NULL,
  "reason"     TEXT,
  "until"      TIMESTAMP(3),
  "actorId"    TEXT,
  -- Desnormalizado de proposito, pela mesma razao que
  -- ActivityLog.actorLabel: a linha tem de continuar a dizer quem
  -- moderou depois de a conta dessa pessoa desaparecer.
  "actorLabel" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReaderSanction_pkey" PRIMARY KEY ("id")
);

-- A consulta e sempre "o historico deste leitor, do mais recente para o
-- mais antigo".
CREATE INDEX "ReaderSanction_readerId_createdAt_idx"
    ON "ReaderSanction"("readerId", "createdAt");

-- CASCADE: o historico e sobre esta pessoa e nao sobrevive a ela.
ALTER TABLE "ReaderSanction"
  ADD CONSTRAINT "ReaderSanction_readerId_fkey"
  FOREIGN KEY ("readerId") REFERENCES "Reader"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: o registo de quem moderou sobrevive a conta de quem moderou.
ALTER TABLE "ReaderSanction"
  ADD CONSTRAINT "ReaderSanction_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
