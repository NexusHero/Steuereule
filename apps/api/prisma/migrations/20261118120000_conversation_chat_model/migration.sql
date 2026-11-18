-- ADR-0096: the chat model a user picked for one conversation ("provider:model"); null = the operator's standard.
ALTER TABLE "BeraterGespraech" ADD COLUMN "modell" TEXT;
