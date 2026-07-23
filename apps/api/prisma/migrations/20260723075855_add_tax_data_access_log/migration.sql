-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('READ', 'WRITE');

-- CreateTable
CREATE TABLE "TaxDataAccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxDataAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxDataAccessLog_userId_idx" ON "TaxDataAccessLog"("userId");
