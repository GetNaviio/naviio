-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "brandLogoUrl" TEXT,
ADD COLUMN     "hideNaviioBranding" BOOLEAN NOT NULL DEFAULT false;
