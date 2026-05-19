-- AlterEnum
ALTER TYPE "ArticleStatus" ADD VALUE 'EM_REVISAO';

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "rejectionReason" TEXT;
