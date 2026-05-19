-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "context" JSONB,
ADD COLUMN     "essentials" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pullQuote" JSONB;
