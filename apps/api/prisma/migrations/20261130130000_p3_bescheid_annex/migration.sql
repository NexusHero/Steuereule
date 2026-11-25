-- P3 (H2-1): Bescheid values are confirmed on their own Anlage `bescheid` and no longer with the Hauptvordruck.
UPDATE "Kennzeichnung" SET "anlage" = 'bescheid' WHERE "postenKey" LIKE 'assessment.%';
