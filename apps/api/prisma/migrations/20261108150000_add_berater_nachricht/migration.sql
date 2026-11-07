-- CreateTable
CREATE TABLE "BeraterNachricht" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "rolle" TEXT NOT NULL,
    "inhalt" TEXT NOT NULL,
    "metaDaten" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeraterNachricht_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeraterNachricht_userId_steuerjahr_createdAt_idx" ON "BeraterNachricht"("userId", "steuerjahr", "createdAt");
