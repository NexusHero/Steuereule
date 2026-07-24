-- Expand-only migration: add the LegalHold seam (ADR-0013 §5, product ADR-011).
-- Records active legal holds that exempt matching rows from erasure/anonymisation
-- during account deletion. The exempt set is currently empty (no filing model yet),
-- but the mechanism is real and the REQ-011 acceptance test seeds a synthetic hold.

CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "holdUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalHold_userId_idx" ON "LegalHold"("userId");
