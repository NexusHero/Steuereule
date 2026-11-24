-- Retention clock of guests (ADR-0109): a guest id has no User row, so nothing said when it was last used.
-- Expand-only: a new table.
CREATE TABLE "GuestActivity" (
    "userId" TEXT NOT NULL,
    "lastWriteAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestActivity_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "GuestActivity_lastWriteAt_idx" ON "GuestActivity"("lastWriteAt");

-- Guests that exist today start their 30 days now. An id without a User row that holds a profile, interview
-- answers, a tax year, a Beleg or a chat is a guest (an upgraded guest's leftovers are swept the same way).
INSERT INTO "GuestActivity" ("userId", "lastWriteAt")
SELECT DISTINCT ids."userId", now()
FROM (
    SELECT "userId" FROM "Profile"
    UNION SELECT "userId" FROM "TaxYear"
    UNION SELECT "userId" FROM "InterviewAnswer"
    UNION SELECT "userId" FROM "Beleg"
    UNION SELECT "userId" FROM "BeraterGespraech"
) AS ids
WHERE ids."userId" NOT IN (SELECT "id" FROM "User")
  AND ids."userId" NOT LIKE 'deleted:%'
ON CONFLICT ("userId") DO NOTHING;
