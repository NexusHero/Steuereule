-- Postgres does not index foreign keys on its own. Both tables cascade from "User", so deleting an
-- account and every lookup of a user's sessions or linked providers scanned the whole table.
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
