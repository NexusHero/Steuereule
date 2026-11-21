-- ADR-0052 amendment 4: an assistant is told apart by its OAuth client id, not by the name it gave itself.
ALTER TABLE "Kennzeichnung" ADD COLUMN "herkunftClientId" TEXT,
ADD COLUMN "vorschlagClientId" TEXT;

-- The task table is new with this release and holds no rows yet.
ALTER TABLE "AssistentAufgabe" ADD COLUMN "clientId" TEXT NOT NULL;
