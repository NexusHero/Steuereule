-- CreateTable
CREATE TABLE "UebernahmeKennzeichnung" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "vorjahr" INTEGER NOT NULL,
    "postenKey" TEXT NOT NULL,
    "bestaetigt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UebernahmeKennzeichnung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UebernahmeKennzeichnung_userId_steuerjahr_postenKey_key" ON "UebernahmeKennzeichnung"("userId", "steuerjahr", "postenKey");

-- CreateIndex
CREATE INDEX "UebernahmeKennzeichnung_userId_steuerjahr_idx" ON "UebernahmeKennzeichnung"("userId", "steuerjahr");
