-- Where a daily benefit in Ziffer 8 of the Swiss wage statement came from (ADR-0072, Punkt 5): the answer
-- decides whether and into which field the amount is deducted. Encrypted at rest (health data). Additive;
-- null = not answered (recorded before the question existed).
ALTER TABLE "ChLohnausweis" ADD COLUMN "taggeldQuelle" TEXT;
