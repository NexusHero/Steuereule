-- #481: several conversations per tax return. The existing conversation of a year becomes the
-- first one; nothing is lost and no message changes.
CREATE TABLE "BeraterGespraech" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "titel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "zuletztBenutzt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeraterGespraech_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BeraterGespraech_userId_steuerjahr_zuletztBenutzt_idx" ON "BeraterGespraech"("userId", "steuerjahr", "zuletztBenutzt");

ALTER TABLE "BeraterNachricht" ADD COLUMN "gespraechId" TEXT;

-- One conversation per user and year that already has messages. The title stays empty: it is an
-- encrypted field, and the app shows such a conversation under its date.
INSERT INTO "BeraterGespraech" ("id", "userId", "steuerjahr", "createdAt", "zuletztBenutzt")
SELECT gen_random_uuid()::text, "userId", "steuerjahr", MIN("createdAt"), MAX("createdAt")
FROM "BeraterNachricht"
GROUP BY "userId", "steuerjahr";

UPDATE "BeraterNachricht" n
SET "gespraechId" = g."id"
FROM "BeraterGespraech" g
WHERE g."userId" = n."userId" AND g."steuerjahr" = n."steuerjahr";

CREATE INDEX "BeraterNachricht_gespraechId_createdAt_idx" ON "BeraterNachricht"("gespraechId", "createdAt");

ALTER TABLE "BeraterNachricht" ADD CONSTRAINT "BeraterNachricht_gespraechId_fkey" FOREIGN KEY ("gespraechId") REFERENCES "BeraterGespraech"("id") ON DELETE CASCADE ON UPDATE CASCADE;
