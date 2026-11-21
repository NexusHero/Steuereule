-- #547: a task the user's own assistant (MCP, ADR-0052) leaves for the user in the app.
-- "inhalt" is field-encrypted (prisma-field-encryption, strict); no FK to "User", like every
-- tax-data table: the account deletion erases the rows itself so that a legal hold can keep them.
CREATE TABLE "AssistentAufgabe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "art" TEXT NOT NULL,
    "inhalt" TEXT NOT NULL,
    "assistent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entschiedenAm" TIMESTAMP(3),

    CONSTRAINT "AssistentAufgabe_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistentAufgabe_userId_steuerjahr_idx" ON "AssistentAufgabe"("userId", "steuerjahr");
