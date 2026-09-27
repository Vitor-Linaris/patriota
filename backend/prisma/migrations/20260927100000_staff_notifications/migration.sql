-- O sino de notificacoes internas da redaccao.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "staffNotifPrefs" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Article" ADD COLUMN "authorNotifiedAt" TIMESTAMP(3);

-- Backfill OBRIGATORIO: marca todo o arquivo ja publicado como
-- ja-notificado. Sem isto, o primeiro tick avisaria TODOS os autores
-- de TODOS os artigos ja publicados desde sempre.
UPDATE "Article" SET "authorNotifiedAt" = now() WHERE "status" = 'PUBLICADO';

-- CreateIndex
CREATE INDEX "Article_status_authorNotifiedAt_idx" ON "Article"("status", "authorNotifiedAt");

-- CreateEnum
CREATE TYPE "StaffNotificationType" AS ENUM (
  'ARTIGO_REVISAO',
  'ARTIGO_PUBLICADO',
  'PACOTE',
  'UTILIZADOR',
  'PERMISSOES',
  'COMENTARIO',
  'CATEGORIA',
  'PUBLICIDADE',
  'CONFIGURACOES'
);

-- CreateTable
CREATE TABLE "StaffNotification" (
  "id"          TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "type"        "StaffNotificationType" NOT NULL,
  "title"       TEXT NOT NULL,
  "href"        TEXT,
  "readAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffNotification_recipientId_readAt_idx" ON "StaffNotification"("recipientId", "readAt");
CREATE INDEX "StaffNotification_recipientId_createdAt_idx" ON "StaffNotification"("recipientId", "createdAt");

ALTER TABLE "StaffNotification"
  ADD CONSTRAINT "StaffNotification_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
