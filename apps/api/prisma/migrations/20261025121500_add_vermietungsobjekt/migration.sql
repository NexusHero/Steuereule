-- CreateTable
CREATE TABLE "Vermietungsobjekt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "mieteinnahmen" TEXT,
    "anschaffungskosten" TEXT,
    "baujahr" TEXT,
    "werbungskosten" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vermietungsobjekt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vermietungsobjekt_userId_steuerjahr_idx" ON "Vermietungsobjekt"("userId", "steuerjahr");
