-- The user's own description of the household's situation (#501): one encrypted text per user,
-- read by the owl in every conversation of every tax year.
CREATE TABLE "BeraterSituation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inhalt" TEXT NOT NULL,
    "geaendertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeraterSituation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BeraterSituation_userId_key" ON "BeraterSituation"("userId");
