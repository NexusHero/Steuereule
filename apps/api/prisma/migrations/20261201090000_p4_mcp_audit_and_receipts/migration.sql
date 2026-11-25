-- "Zuletzt aktiv" of a connected assistant is the newest audit row with its source (beta P4, MCP-8).
CREATE INDEX "TaxDataAccessLog_userId_source_createdAt_idx" ON "TaxDataAccessLog"("userId", "source", "createdAt");

-- The assistant that uploaded a receipt over MCP, so it alone may take it back (beta P4, H2-24).
ALTER TABLE "Beleg" ADD COLUMN "hochgeladenVonClient" TEXT;
