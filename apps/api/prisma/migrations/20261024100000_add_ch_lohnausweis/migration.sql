-- CreateTable
CREATE TABLE "ChLohnausweis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "lohn" TEXT,
    "gehaltsnebenleistungen" TEXT,
    "unregelmaessigeLeistungen" TEXT,
    "kapitalleistungen" TEXT,
    "beteiligungsrechte" TEXT,
    "sitzungsgelder" TEXT,
    "andereLeistungen" TEXT,
    "bruttolohnTotal" TEXT,
    "ahvBeitraege" TEXT,
    "beruflicheVorsorge" TEXT,
    "nettolohn" TEXT,
    "quellensteuer" TEXT,
    "spesen" TEXT,
    "weitereNebenleistungen" TEXT,
    "bemerkungen" TEXT,
    "saeule3aChf" TEXT,
    "krankenkasseChf" TEXT,
    "wechselkursMonat" TEXT,
    "wechselkursKurs" DOUBLE PRECISION,
    "wechselkursModus" TEXT,
    "wechselkursBelegId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChLohnausweis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChLohnausweis_userId_steuerjahr_key" ON "ChLohnausweis"("userId", "steuerjahr");
