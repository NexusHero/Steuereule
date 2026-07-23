-- CreateTable
CREATE TABLE "TaxYear" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "baseEstimate" INTEGER NOT NULL,
    "openItems" INTEGER NOT NULL,
    "openConflicts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxYear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxYear_userId_steuerjahr_key" ON "TaxYear"("userId", "steuerjahr");
