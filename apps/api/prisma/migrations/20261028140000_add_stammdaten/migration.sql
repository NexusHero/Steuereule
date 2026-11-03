-- CreateTable
CREATE TABLE "Stammdaten" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "geburtsdatum" TEXT,
    "strasse" TEXT,
    "hausnummer" TEXT,
    "hausnummerZusatz" TEXT,
    "plz" TEXT,
    "wohnort" TEXT,
    "beruf" TEXT,
    "religion" TEXT,
    "religionEinwilligungAm" TIMESTAMP(3),
    "familienstand" TEXT,
    "familienstandSeit" TEXT,
    "iban" TEXT,
    "kontoinhaber" TEXT,
    "finanzamt" TEXT,
    "telefon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stammdaten_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stammdaten_userId_key" ON "Stammdaten"("userId");

