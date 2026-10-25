-- CreateTable
CREATE TABLE "Kapital" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "kapitalertraege" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kapital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kapital_userId_steuerjahr_key" ON "Kapital"("userId", "steuerjahr");

-- CreateIndex
CREATE INDEX "Kapital_userId_idx" ON "Kapital"("userId");
