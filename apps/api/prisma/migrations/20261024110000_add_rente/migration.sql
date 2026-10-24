-- CreateTable
CREATE TABLE "Rente" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "rentenart" TEXT,
    "jahresbetrag" TEXT,
    "rentenbeginnJahr" TEXT,
    "alterBeiRentenbeginn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rente_userId_steuerjahr_key" ON "Rente"("userId", "steuerjahr");
