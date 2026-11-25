-- P6 (beta review): account and security.

-- API-1: the device session takes over the approving session's createdAt.
ALTER TABLE "DeviceCode" ADD COLUMN "approvedSessionCreatedAt" TIMESTAMP(3);

-- API-19: requestIp/requestUserAgent are field-encrypted from now on. Codes live two minutes; the ones that
-- expired still hold the address in plaintext and are of no use to anyone.
DELETE FROM "DeviceCode" WHERE "expiresAt" < NOW();

-- API-3 (decision 3): Person B agrees per tax year. The years that exist today were joined by B with a code or
-- created under the link B accepted, and B has seen them shared: they keep that consent. Every year created from
-- now on starts without one, so A sees nothing of B for it until B agrees in B's own app.
ALTER TABLE "SteuerjahrKopplung" ADD COLUMN "personBZustimmungAm" TIMESTAMP(3);
UPDATE "SteuerjahrKopplung"
   SET "personBZustimmungAm" = "updatedAt"
 WHERE "personBUserId" <> '' AND "personBUserId" NOT LIKE 'spouse\_%';

-- API-18: provider tokens of Google/Apple sign-ins are not used and no longer stored.
UPDATE "Account"
   SET "accessToken" = NULL, "refreshToken" = NULL, "idToken" = NULL,
       "accessTokenExpiresAt" = NULL, "refreshTokenExpiresAt" = NULL
 WHERE "providerId" <> 'credential';
