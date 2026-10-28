-- CreateTable
CREATE TABLE "Freischaltung" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "betragCent" INTEGER,
    "bezahltAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Freischaltung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Freischaltung_stripeCheckoutSessionId_key" ON "Freischaltung"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "Freischaltung_userId_steuerjahr_idx" ON "Freischaltung"("userId", "steuerjahr");

-- AddForeignKey
ALTER TABLE "Freischaltung" ADD CONSTRAINT "Freischaltung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

