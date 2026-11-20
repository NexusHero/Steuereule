-- ADR-0101: Selbstständige — business profile, the book (append-only), assets, bank import, booking rules,
-- and the price tier of an unlock. Additive only; no existing value changes.

-- AlterTable
ALTER TABLE "Freischaltung" ADD COLUMN     "stufe" TEXT NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "Betrieb" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "person" TEXT NOT NULL DEFAULT 'A',
    "art" TEXT,
    "berufsAngaben" TEXT,
    "vorschlag" TEXT,
    "bezeichnung" TEXT,
    "gewinnermittlung" TEXT NOT NULL DEFAULT 'euer',
    "kontenrahmen" TEXT NOT NULL DEFAULT 'SKR03',
    "kleinunternehmer" BOOLEAN NOT NULL DEFAULT false,
    "versteuerung" TEXT NOT NULL DEFAULT 'ist',
    "gemeindeAgs" TEXT,
    "hebesatzKorrektur" TEXT,
    "beginn" TEXT,
    "ustVorauszahlungen" TEXT,
    "gewstAngaben" TEXT,
    "verlustAngaben" TEXT,
    "beteiligungen" TEXT,
    "verfahrensdoku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Betrieb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "person" TEXT NOT NULL DEFAULT 'A',
    "kontenrahmen" TEXT NOT NULL,
    "gewinnermittlung" TEXT NOT NULL,
    "festgeschriebenBis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Buch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buchung" (
    "id" TEXT NOT NULL,
    "buchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "nummer" INTEGER NOT NULL,
    "datum" TEXT NOT NULL,
    "belegnummer" TEXT NOT NULL,
    "belegverweis" TEXT,
    "buchungstext" TEXT NOT NULL,
    "wiederkehrend" TEXT,
    "stornoVon" INTEGER,
    "herkunft" TEXT NOT NULL DEFAULT 'nutzer',
    "inhaltHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Buchung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buchungszeile" (
    "id" TEXT NOT NULL,
    "buchungId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "zeile" INTEGER NOT NULL,
    "konto" TEXT NOT NULL,
    "seite" TEXT NOT NULL,
    "betrag" TEXT NOT NULL,
    "steuerschluessel" TEXT NOT NULL,
    "steueranteil" TEXT,

    CONSTRAINT "Buchungszeile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buchungsprotokoll" (
    "id" TEXT NOT NULL,
    "buchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "lfdNr" INTEGER NOT NULL,
    "zeitpunkt" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "inhalt" TEXT NOT NULL,
    "vorgaengerHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "Buchungsprotokoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anlagegut" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "person" TEXT NOT NULL DEFAULT 'A',
    "bezeichnung" TEXT NOT NULL,
    "konto" TEXT NOT NULL,
    "anschaffungsdatum" TEXT NOT NULL,
    "anschaffungskosten" TEXT NOT NULL,
    "methode" TEXT NOT NULL,
    "anlagenart" TEXT,
    "nutzungsdauer" INTEGER,
    "sonderAfa" TEXT,
    "abgang" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anlagegut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kontoumsatz" (
    "id" TEXT NOT NULL,
    "buchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "fingerabdruck" TEXT NOT NULL,
    "betrag" TEXT NOT NULL,
    "angaben" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "buchungNummer" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kontoumsatz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buchungsregel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "person" TEXT NOT NULL DEFAULT 'A',
    "kriterien" TEXT NOT NULL,
    "konto" TEXT NOT NULL,
    "steuerschluessel" TEXT NOT NULL,
    "buchungstext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Buchungsregel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Betrieb_userId_steuerjahr_idx" ON "Betrieb"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "Betrieb_userId_steuerjahr_person_key" ON "Betrieb"("userId", "steuerjahr", "person");

-- CreateIndex
CREATE INDEX "Buch_userId_steuerjahr_idx" ON "Buch"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "Buch_userId_steuerjahr_person_key" ON "Buch"("userId", "steuerjahr", "person");

-- CreateIndex
CREATE INDEX "Buchung_userId_steuerjahr_idx" ON "Buchung"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "Buchung_buchId_nummer_key" ON "Buchung"("buchId", "nummer");

-- CreateIndex
CREATE INDEX "Buchungszeile_userId_steuerjahr_idx" ON "Buchungszeile"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "Buchungszeile_buchungId_zeile_key" ON "Buchungszeile"("buchungId", "zeile");

-- CreateIndex
CREATE INDEX "Buchungsprotokoll_userId_steuerjahr_idx" ON "Buchungsprotokoll"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "Buchungsprotokoll_buchId_lfdNr_key" ON "Buchungsprotokoll"("buchId", "lfdNr");

-- CreateIndex
CREATE INDEX "Anlagegut_userId_steuerjahr_idx" ON "Anlagegut"("userId", "steuerjahr");

-- CreateIndex
CREATE INDEX "Kontoumsatz_userId_steuerjahr_idx" ON "Kontoumsatz"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "Kontoumsatz_buchId_fingerabdruck_key" ON "Kontoumsatz"("buchId", "fingerabdruck");

-- CreateIndex
CREATE INDEX "Buchungsregel_userId_idx" ON "Buchungsregel"("userId");

-- AddForeignKey
ALTER TABLE "Buchung" ADD CONSTRAINT "Buchung_buchId_fkey" FOREIGN KEY ("buchId") REFERENCES "Buch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buchungszeile" ADD CONSTRAINT "Buchungszeile_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "Buchung"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buchungsprotokoll" ADD CONSTRAINT "Buchungsprotokoll_buchId_fkey" FOREIGN KEY ("buchId") REFERENCES "Buch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kontoumsatz" ADD CONSTRAINT "Kontoumsatz_buchId_fkey" FOREIGN KEY ("buchId") REFERENCES "Buch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Append-only (GoBD Rz. 58 ff., ADR-0101 §13): an entry, its lines and the log are never changed or
-- deleted, by the app or by anyone with a database connection. The one exception is the erasure of an
-- account (Art. 17 DSGVO): deleteAccountTransaction sets the transaction-local setting
-- `steuereule.erasure` to 'on' first, and only then may rows be deleted. An UPDATE is never allowed.
CREATE OR REPLACE FUNCTION steuereule_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') AND current_setting('steuereule.erasure', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'append-only: % on "%" is not allowed (GoBD, ADR-0101)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Buchung_append_only" BEFORE UPDATE OR DELETE ON "Buchung"
  FOR EACH ROW EXECUTE FUNCTION steuereule_append_only();
CREATE TRIGGER "Buchung_no_truncate" BEFORE TRUNCATE ON "Buchung"
  FOR EACH STATEMENT EXECUTE FUNCTION steuereule_append_only();
CREATE TRIGGER "Buchungszeile_append_only" BEFORE UPDATE OR DELETE ON "Buchungszeile"
  FOR EACH ROW EXECUTE FUNCTION steuereule_append_only();
CREATE TRIGGER "Buchungszeile_no_truncate" BEFORE TRUNCATE ON "Buchungszeile"
  FOR EACH STATEMENT EXECUTE FUNCTION steuereule_append_only();
CREATE TRIGGER "Buchungsprotokoll_append_only" BEFORE UPDATE OR DELETE ON "Buchungsprotokoll"
  FOR EACH ROW EXECUTE FUNCTION steuereule_append_only();
CREATE TRIGGER "Buchungsprotokoll_no_truncate" BEFORE TRUNCATE ON "Buchungsprotokoll"
  FOR EACH STATEMENT EXECUTE FUNCTION steuereule_append_only();

-- The book itself: its identity, chart and mode stay as created, the Festschreibung only moves forward,
-- and it is deleted only with the account (same erasure flag).
CREATE OR REPLACE FUNCTION steuereule_ledger_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('steuereule.erasure', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'append-only: DELETE on "Buch" is not allowed (GoBD, ADR-0101)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."userId" <> OLD."userId" OR NEW."steuerjahr" <> OLD."steuerjahr" OR NEW."person" <> OLD."person"
     OR NEW."kontenrahmen" <> OLD."kontenrahmen" OR NEW."gewinnermittlung" <> OLD."gewinnermittlung" THEN
    RAISE EXCEPTION 'append-only: a book keeps its owner, year, chart and mode (ADR-0101)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."festgeschriebenBis" IS NOT NULL
     AND (NEW."festgeschriebenBis" IS NULL OR NEW."festgeschriebenBis" < OLD."festgeschriebenBis") THEN
    RAISE EXCEPTION 'append-only: the Festschreibung of "Buch" only moves forward (GoBD Rz. 107)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Buch_guard" BEFORE UPDATE OR DELETE ON "Buch"
  FOR EACH ROW EXECUTE FUNCTION steuereule_ledger_guard();
