-- CreateTable
CREATE TABLE "Lstb" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "bruttoarbeitslohn" TEXT,
    "lohnsteuer" TEXT,
    "sozialversicherung" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lstb_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lstb_userId_steuerjahr_key" ON "Lstb"("userId", "steuerjahr");
