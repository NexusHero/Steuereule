-- ADR-0052 §6/§7: die Übernahme-Kennzeichnung wird zur generischen Kennzeichnung je Feld
-- (Herkunft, Bestätigung, Vorschlag). Bestehende Kennzeichnungen bleiben erhalten: jeder
-- Fakt-Schlüssel der Jahresübernahme wird auf die Felder aufgefächert, die die Übernahme kopiert.

ALTER TABLE "UebernahmeKennzeichnung" RENAME TO "Kennzeichnung";
ALTER TABLE "Kennzeichnung" RENAME CONSTRAINT "UebernahmeKennzeichnung_pkey" TO "Kennzeichnung_pkey";
ALTER INDEX "UebernahmeKennzeichnung_userId_steuerjahr_postenKey_key" RENAME TO "Kennzeichnung_userId_steuerjahr_postenKey_key";
ALTER INDEX "UebernahmeKennzeichnung_userId_steuerjahr_idx" RENAME TO "Kennzeichnung_userId_steuerjahr_idx";

ALTER TABLE "Kennzeichnung"
    ALTER COLUMN "vorjahr" DROP NOT NULL,
    ADD COLUMN "anlage" TEXT,
    ADD COLUMN "herkunftArt" TEXT,
    ADD COLUMN "herkunftName" TEXT,
    ADD COLUMN "herkunftBelegId" TEXT,
    ADD COLUMN "vorschlagHerkunftArt" TEXT,
    ADD COLUMN "vorschlagHerkunftName" TEXT,
    ADD COLUMN "vorschlagBelegId" TEXT,
    ADD COLUMN "vorschlagVorjahr" INTEGER,
    ADD COLUMN "vorschlagWert" TEXT;

INSERT INTO "Kennzeichnung" ("id", "userId", "steuerjahr", "vorjahr", "postenKey", "bestaetigt", "createdAt", "updatedAt", "anlage", "herkunftArt")
SELECT gen_random_uuid()::text, k."userId", k."steuerjahr", k."vorjahr", f.feld_key, k."bestaetigt", k."createdAt", k."updatedAt", f.anlage, 'uebernahme'
FROM "Kennzeichnung" k
JOIN (VALUES
    ('lstb', 'lstb.bruttoarbeitslohn', 'anlageN'),
    ('lstb', 'lstb.lohnsteuer', 'anlageN'),
    ('lstb', 'lstb.sozialversicherung', 'anlageN'),
    ('rente', 'rente.rentenart', 'anlageR'),
    ('rente', 'rente.jahresbetrag', 'anlageR'),
    ('rente', 'rente.rentenbeginnJahr', 'anlageR'),
    ('rente', 'rente.alterBeiRentenbeginn', 'anlageR'),
    ('kapital', 'kapital.kapitalertraege', 'anlageKap')
) AS f(fakt_key, feld_key, anlage) ON k."postenKey" = f.fakt_key;

INSERT INTO "Kennzeichnung" ("id", "userId", "steuerjahr", "vorjahr", "postenKey", "bestaetigt", "createdAt", "updatedAt", "anlage", "herkunftArt")
SELECT gen_random_uuid()::text, k."userId", k."steuerjahr", k."vorjahr",
       'vermietung:' || substr(k."postenKey", length('vermietung-') + 1) || '.' || f.feld,
       k."bestaetigt", k."createdAt", k."updatedAt", 'anlageV', 'uebernahme'
FROM "Kennzeichnung" k
CROSS JOIN (VALUES ('mieteinnahmen'), ('anschaffungskosten'), ('baujahr'), ('werbungskosten')) AS f(feld)
WHERE k."postenKey" LIKE 'vermietung-%';

DELETE FROM "Kennzeichnung" WHERE "postenKey" NOT LIKE '%.%';

ALTER TABLE "Kennzeichnung"
    ALTER COLUMN "anlage" SET NOT NULL,
    ALTER COLUMN "herkunftArt" SET NOT NULL;
