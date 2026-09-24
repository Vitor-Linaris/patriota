-- Publicacao automatica nas redes sociais.
--
-- Mesmo padrao do ArticleNotification: um poller reclama o artigo numa
-- coluna nullable e escreve linhas de outbox. Nao e um gancho no
-- publish() porque um artigo chega a PUBLICADO por cinco caminhos e so
-- tres passam por la.

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "socialQueuedAt" TIMESTAMP(3);

-- Backfill OBRIGATORIO: marca todo o arquivo ja publicado como tratado.
-- Sem isto, o primeiro tick do cron depois do deploy tenta publicar o
-- arquivo inteiro no Instagram, contra um tecto de 100 posts por 24h --
-- e uma conta quase de certeza sinalizada pela Meta.
-- (O poller tambem se limita a publishedAt >= now() - 24h, mas isso e a
-- segunda linha de defesa, nao a primeira.)
UPDATE "Article" SET "socialQueuedAt" = now() WHERE "status" = 'PUBLICADO';

-- CreateIndex
CREATE INDEX "Article_status_socialQueuedAt_idx" ON "Article"("status", "socialQueuedAt");

-- CreateEnum
CREATE TYPE "SocialNetwork" AS ENUM ('FACEBOOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM (
  'AGENDADO',
  'A_ENVIAR',
  'ENVIADO',
  'FALHOU',
  'CANCELADO'
);

-- CreateTable
CREATE TABLE "SocialPost" (
  "id"           TEXT NOT NULL,
  "articleId"    TEXT NOT NULL,
  "network"      "SocialNetwork" NOT NULL,
  "status"       "SocialPostStatus" NOT NULL DEFAULT 'AGENDADO',
  "message"      TEXT NOT NULL,
  "imageUrl"     TEXT,
  "linkUrl"      TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "lastError"    TEXT,
  "remoteId"     TEXT,
  "remoteUrl"    TEXT,
  "sentAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- A garantia de idempotencia. publish() nao e idempotente: republicar um
-- artigo reescreve publishedAt, e sem esta restricao republicava-o
-- tambem no Instagram.
CREATE UNIQUE INDEX "SocialPost_articleId_network_key" ON "SocialPost"("articleId", "network");

-- A pergunta do drenar: "o que esta agendado e ja passou da hora?".
CREATE INDEX "SocialPost_status_scheduledFor_idx" ON "SocialPost"("status", "scheduledFor");

CREATE INDEX "SocialPost_articleId_idx" ON "SocialPost"("articleId");

-- CASCADE: a fila de divulgacao de um artigo nao sobrevive ao artigo.
ALTER TABLE "SocialPost"
  ADD CONSTRAINT "SocialPost_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "Article"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
