-- Pacotes exclusivos: conjuntos de artigos vendidos numa compra única.
--
-- O segundo eixo de monetização. Reader.plan responde "esta pessoa
-- assina?"; um pacote responde "esta pessoa comprou ISTO?", que é uma
-- pergunta por-artigo que o plano não consegue expressar. Ambos
-- alimentam o mesmo paywall em ArticlesService.findPublicBySlug.
--
-- Quatro tabelas, e a distinção entre duas delas é o coração da coisa:
--   PackageArticle      — o que o pacote contém AGORA (estado editorial,
--                         muda à vontade)
--   PackagePurchaseItem — o que alguém PAGOU (direito adquirido, nunca
--                         reescrito quando o editor mexe no pacote)
--
-- Aditivo: nada em Article, Reader ou no billing muda de forma.


-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "PackagePurchaseStatus" AS ENUM ('PENDENTE', 'PAGO', 'EXPIRADO', 'REEMBOLSADO');

-- CreateEnum
CREATE TYPE "PackagePurchaseSource" AS ENUM ('STRIPE', 'MANUAL');

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "PackageStatus" NOT NULL DEFAULT 'RASCUNHO',
    "includedInSubscription" BOOLEAN NOT NULL DEFAULT true,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageArticle" (
    "packageId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageArticle_pkey" PRIMARY KEY ("packageId","articleId")
);

-- CreateTable
CREATE TABLE "PackagePurchase" (
    "id" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "PackagePurchaseStatus" NOT NULL DEFAULT 'PENDENTE',
    "source" "PackagePurchaseSource" NOT NULL DEFAULT 'STRIPE',
    "snapshotArticleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "grantedById" TEXT,
    "grantNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PackagePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagePurchaseItem" (
    "purchaseId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagePurchaseItem_pkey" PRIMARY KEY ("purchaseId","articleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Package_slug_key" ON "Package"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Package_stripeProductId_key" ON "Package"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Package_stripePriceId_key" ON "Package"("stripePriceId");

-- CreateIndex
CREATE INDEX "Package_status_publishedAt_idx" ON "Package"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Package_createdById_idx" ON "Package"("createdById");

-- CreateIndex
CREATE INDEX "PackageArticle_articleId_idx" ON "PackageArticle"("articleId");

-- CreateIndex
CREATE INDEX "PackageArticle_packageId_position_idx" ON "PackageArticle"("packageId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePurchase_stripeCheckoutSessionId_key" ON "PackagePurchase"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePurchase_stripePaymentIntentId_key" ON "PackagePurchase"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "PackagePurchase_readerId_createdAt_idx" ON "PackagePurchase"("readerId", "createdAt");

-- CreateIndex
CREATE INDEX "PackagePurchase_packageId_status_idx" ON "PackagePurchase"("packageId", "status");

-- CreateIndex
CREATE INDEX "PackagePurchase_status_createdAt_idx" ON "PackagePurchase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PackagePurchase_grantedById_idx" ON "PackagePurchase"("grantedById");

-- CreateIndex
CREATE INDEX "PackagePurchaseItem_readerId_articleId_idx" ON "PackagePurchaseItem"("readerId", "articleId");

-- CreateIndex
CREATE INDEX "PackagePurchaseItem_articleId_idx" ON "PackagePurchaseItem"("articleId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageArticle" ADD CONSTRAINT "PackageArticle_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageArticle" ADD CONSTRAINT "PackageArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "Reader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchaseItem" ADD CONSTRAINT "PackagePurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PackagePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchaseItem" ADD CONSTRAINT "PackagePurchaseItem_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

