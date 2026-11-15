-- ADR-0091: the consent that personal data may go to the owl's language model. Expand-only, a new table.
CREATE TABLE "EulenPersonendatenEinwilligung" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "erteiltAm" TIMESTAMP(3) NOT NULL,
    "widerrufenAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EulenPersonendatenEinwilligung_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EulenPersonendatenEinwilligung_userId_key" ON "EulenPersonendatenEinwilligung"("userId");
