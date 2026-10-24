-- CreateTable
CREATE TABLE "Beleg" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateiname" TEXT NOT NULL,
    "belegdatum" TIMESTAMP(3),
    "zahlungsdatum" TIMESTAMP(3),
    "steuerjahr" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beleg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Beleg_userId_idx" ON "Beleg"("userId");

-- CreateIndex
CREATE INDEX "Beleg_userId_steuerjahr_idx" ON "Beleg"("userId", "steuerjahr");
