-- CreateTable
CREATE TABLE "NutzerSchluessel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutzerSchluessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BelegDatei" (
    "id" TEXT NOT NULL,
    "belegId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "dateigroesse" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "verschluesselteDaten" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BelegDatei_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutzerSchluessel_userId_key" ON "NutzerSchluessel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BelegDatei_belegId_key" ON "BelegDatei"("belegId");

-- CreateIndex
CREATE INDEX "BelegDatei_userId_idx" ON "BelegDatei"("userId");

-- AddForeignKey
ALTER TABLE "BelegDatei" ADD CONSTRAINT "BelegDatei_belegId_fkey" FOREIGN KEY ("belegId") REFERENCES "Beleg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
