-- CreateTable
CREATE TABLE "NutzerSchluessel" (
    "userId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutzerSchluessel_pkey" PRIMARY KEY ("userId")
);
