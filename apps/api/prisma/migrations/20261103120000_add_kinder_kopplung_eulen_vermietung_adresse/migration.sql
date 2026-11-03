-- AlterTable
ALTER TABLE "Vermietungsobjekt"
ADD COLUMN "strasse" TEXT,
ADD COLUMN "hausnummer" TEXT,
ADD COLUMN "plz" TEXT,
ADD COLUMN "ort" TEXT,
ADD COLUMN "wohnflaeche" TEXT;

-- CreateTable
CREATE TABLE "Kind" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "lfdNr" INTEGER NOT NULL DEFAULT 1,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "geburtsdatum" TEXT NOT NULL,
    "idnr" TEXT,
    "kindergeldAnspruchEur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteuerjahrKopplung" (
    "id" TEXT NOT NULL,
    "personAUserId" TEXT NOT NULL,
    "personBUserId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "veranlagungsart" TEXT NOT NULL DEFAULT 'zusammen',
    "einladungsCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteuerjahrKopplung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EulenEinstellung" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aktiviert" BOOLEAN NOT NULL DEFAULT false,
    "aktiviertAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EulenEinstellung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EulenKartenVerwurf" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "verworfenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EulenKartenVerwurf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kind_userId_steuerjahr_idx" ON "Kind"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "SteuerjahrKopplung_einladungsCode_key" ON "SteuerjahrKopplung"("einladungsCode");

-- CreateIndex
CREATE UNIQUE INDEX "SteuerjahrKopplung_personAUserId_steuerjahr_key" ON "SteuerjahrKopplung"("personAUserId", "steuerjahr");

-- CreateIndex
CREATE INDEX "SteuerjahrKopplung_personBUserId_steuerjahr_idx" ON "SteuerjahrKopplung"("personBUserId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "EulenEinstellung_userId_key" ON "EulenEinstellung"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EulenKartenVerwurf_userId_steuerjahr_fingerprint_key" ON "EulenKartenVerwurf"("userId", "steuerjahr", "fingerprint");

-- CreateIndex
CREATE INDEX "EulenKartenVerwurf_userId_steuerjahr_idx" ON "EulenKartenVerwurf"("userId", "steuerjahr");
