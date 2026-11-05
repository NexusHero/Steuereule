CREATE TABLE "Arbeitsweg" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "arbeitstage" TEXT NOT NULL,
    "urlaubstage" INTEGER NOT NULL DEFAULT 0,
    "krankheitstage" INTEGER NOT NULL DEFAULT 0,
    "homeofficeTage" INTEGER NOT NULL DEFAULT 0,
    "einfacheKm" INTEGER,
    "verkehrsmittel" TEXT,
    "taetigkeitsstaette" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Arbeitsweg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Arbeitsweg_userId_steuerjahr_key" ON "Arbeitsweg"("userId", "steuerjahr");
