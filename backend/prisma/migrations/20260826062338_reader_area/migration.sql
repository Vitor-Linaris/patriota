-- CreateEnum
CREATE TYPE "ReaderStatus" AS ENUM ('PENDENTE_VERIFICACAO', 'ATIVO', 'SUSPENSO', 'ANONIMIZADO');

-- CreateEnum
CREATE TYPE "ReaderPlan" AS ENUM ('GRATIS', 'PREMIUM');

-- CreateEnum
CREATE TYPE "ReaderAuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'SPAM', 'ELIMINADO');

-- CreateEnum
CREATE TYPE "EmailTokenType" AS ENUM ('VERIFICACAO_EMAIL', 'REPOR_PASSWORD');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('IMEDIATO', 'DIARIO', 'SEMANAL', 'NUNCA');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notificationsQueuedAt" TIMESTAMP(3);

-- Backfill: mark every ALREADY published article as queued so the
-- notification poller never treats the existing archive as new.
-- Without this the first cron tick after deploy fans every historical
-- article out to every reader who follows its category.
-- (The poller also bounds itself to publishedAt >= now() - 24h, but that
-- is the second line of defence, not the first.)
UPDATE "Article" SET "notificationsQueuedAt" = now() WHERE "status" = 'PUBLICADO';

-- CreateTable
CREATE TABLE "Reader" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "password" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "status" "ReaderStatus" NOT NULL DEFAULT 'PENDENTE_VERIFICACAO',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "notifyNewArticles" BOOLEAN NOT NULL DEFAULT true,
    "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'DIARIO',
    "unsubscribeToken" TEXT NOT NULL,
    "displayNamePublic" BOOLEAN NOT NULL DEFAULT true,
    "plan" "ReaderPlan" NOT NULL DEFAULT 'GRATIS',
    "planStatus" TEXT,
    "planRenewsAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaderIdentity" (
    "id" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "provider" "ReaderAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryFavorite" (
    "readerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryFavorite_pkey" PRIMARY KEY ("readerId","categoryId")
);

-- CreateTable
CREATE TABLE "ArticleFavorite" (
    "readerId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleFavorite_pkey" PRIMARY KEY ("readerId","articleId")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDENTE',
    "editedAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderationNote" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingHistory" (
    "id" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readCount" INTEGER NOT NULL DEFAULT 1,
    "progress" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReadingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "type" "EmailTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleNotification" (
    "id" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ArticleNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reader_email_key" ON "Reader"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Reader_unsubscribeToken_key" ON "Reader"("unsubscribeToken");

-- CreateIndex
CREATE UNIQUE INDEX "Reader_stripeCustomerId_key" ON "Reader"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Reader_status_idx" ON "Reader"("status");

-- CreateIndex
CREATE INDEX "Reader_createdAt_idx" ON "Reader"("createdAt");

-- CreateIndex
CREATE INDEX "ReaderIdentity_readerId_idx" ON "ReaderIdentity"("readerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReaderIdentity_provider_providerAccountId_key" ON "ReaderIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "CategoryFavorite_categoryId_notify_idx" ON "CategoryFavorite"("categoryId", "notify");

-- CreateIndex
CREATE INDEX "ArticleFavorite_readerId_createdAt_idx" ON "ArticleFavorite"("readerId", "createdAt");

-- CreateIndex
CREATE INDEX "ArticleFavorite_articleId_idx" ON "ArticleFavorite"("articleId");

-- CreateIndex
CREATE INDEX "Comment_articleId_status_createdAt_idx" ON "Comment"("articleId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_status_createdAt_idx" ON "Comment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_readerId_createdAt_idx" ON "Comment"("readerId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "ReadingHistory_readerId_lastReadAt_idx" ON "ReadingHistory"("readerId", "lastReadAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ReadingHistory_readerId_articleId_key" ON "ReadingHistory"("readerId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_readerId_type_idx" ON "EmailToken"("readerId", "type");

-- CreateIndex
CREATE INDEX "EmailToken_expiresAt_idx" ON "EmailToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ArticleNotification_status_createdAt_idx" ON "ArticleNotification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ArticleNotification_articleId_idx" ON "ArticleNotification"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleNotification_readerId_articleId_key" ON "ArticleNotification"("readerId", "articleId");

-- CreateIndex
CREATE INDEX "Article_status_notificationsQueuedAt_idx" ON "Article"("status", "notificationsQueuedAt");

-- AddForeignKey
ALTER TABLE "ReaderIdentity" ADD CONSTRAINT "ReaderIdentity_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryFavorite" ADD CONSTRAINT "CategoryFavorite_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryFavorite" ADD CONSTRAINT "CategoryFavorite_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleFavorite" ADD CONSTRAINT "ArticleFavorite_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleFavorite" ADD CONSTRAINT "ArticleFavorite_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingHistory" ADD CONSTRAINT "ReadingHistory_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingHistory" ADD CONSTRAINT "ReadingHistory_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleNotification" ADD CONSTRAINT "ArticleNotification_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleNotification" ADD CONSTRAINT "ArticleNotification_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
