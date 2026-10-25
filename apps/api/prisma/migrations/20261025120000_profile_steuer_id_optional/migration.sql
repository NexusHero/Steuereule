-- ADR-0045 (value-first funnel): the Steuer-ID may be added later from Profil.
-- NULL means "not given yet"; any non-NULL value is still validated + field-encrypted.
ALTER TABLE "Profile" ALTER COLUMN "steuerId" DROP NOT NULL;
