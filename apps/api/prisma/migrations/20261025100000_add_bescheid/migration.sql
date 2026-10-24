-- CreateTable
CREATE TABLE "Bescheid" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'eingegangen',
    "bescheiddatum" TEXT,
    "einspruchGrund" TEXT,
    "einnahmen" TEXT,
    "vorsorgeaufwand" TEXT,
    "anrechnung" TEXT,
    "festgesetzteSteuer" TEXT,
    "erstattung" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bescheid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bescheid_userId_steuerjahr_key" ON "Bescheid"("userId", "steuerjahr");

-- CreateIndex
CREATE INDEX "Bescheid_userId_idx" ON "Bescheid"("userId");
