-- ADR-0101 §22: the counterparty's foreign VAT id on an entry (Zusammenfassende Meldung, § 18a UStG) and
-- the person's Voranmeldung facts (period, Dauerfristverlängerung), the sale or giving up of the business
-- (§ 16, § 34 EStG) and the Thesaurierung (§ 34a EStG) on the business profile. Additive.
ALTER TABLE "Buchung" ADD COLUMN "ustIdNr" TEXT;
ALTER TABLE "Betrieb" ADD COLUMN "ustVaAngaben" TEXT;
ALTER TABLE "Betrieb" ADD COLUMN "veraeusserung" TEXT;
ALTER TABLE "Betrieb" ADD COLUMN "thesaurierung" TEXT;
