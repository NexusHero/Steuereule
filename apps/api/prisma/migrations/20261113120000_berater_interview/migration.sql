-- Where the Berater-Interview stands for one tax year: which areas are settled. One encrypted
-- JSON text per user and tax year.
CREATE TABLE "BeraterInterview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "stand" TEXT NOT NULL,
    "geaendertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeraterInterview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BeraterInterview_userId_steuerjahr_key" ON "BeraterInterview"("userId", "steuerjahr");
