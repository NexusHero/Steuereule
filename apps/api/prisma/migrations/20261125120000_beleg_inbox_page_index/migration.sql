-- The Belege inbox reads one page at a time, newest first, by keyset on (createdAt, id).
CREATE INDEX "Beleg_userId_createdAt_id_idx" ON "Beleg"("userId", "createdAt" DESC, "id" DESC);
