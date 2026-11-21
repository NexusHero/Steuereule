-- N-Gre line „SUVA – Geld“: the paid-out daily benefit of the Swiss accident insurance (UVG/SUVA) contained
-- in Ziffer 8. Tax-free like the Krankentaggeld, but under the progression clause (§ 32b EStG). Additive.
ALTER TABLE "ChLohnausweis" ADD COLUMN "steuerfreiesUnfalltaggeldChf" TEXT;
