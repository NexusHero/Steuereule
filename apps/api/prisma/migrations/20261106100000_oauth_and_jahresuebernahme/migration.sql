-- Ticket 17.2 (#385, ADR-0052 §4): OAuth-2.1-Provider für Assistenten (better-auth-Plugin)
-- und Schutz gegen doppelte Jahresübernahme (ADR-0049 / ADR-0052 §7).

-- 1. Jahresuebernahme: persistente Markierung je (userId, steuerjahr)
CREATE TABLE "Jahresuebernahme" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "vorjahr" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Jahresuebernahme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Jahresuebernahme_userId_steuerjahr_idx" ON "Jahresuebernahme"("userId", "steuerjahr");
CREATE UNIQUE INDEX "Jahresuebernahme_userId_steuerjahr_key" ON "Jahresuebernahme"("userId", "steuerjahr");

-- Bestehende Übernahmen aus Kennzeichnung übertragen
INSERT INTO "Jahresuebernahme" ("id", "userId", "steuerjahr", "vorjahr", "createdAt")
SELECT gen_random_uuid(), "userId", "steuerjahr", "vorjahr", MIN("createdAt")
FROM "Kennzeichnung"
WHERE "herkunftArt" = 'uebernahme' AND "vorjahr" IS NOT NULL
GROUP BY "userId", "steuerjahr", "vorjahr"
ON CONFLICT ("userId", "steuerjahr") DO NOTHING;

-- 2. OAuth 2.1 Provider Tabellen (better-auth oauthProvider Plugin)
CREATE TABLE "OauthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientDiscoveryId" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" TEXT[],
    "clientCredentialsScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[],
    "postLogoutRedirectUris" TEXT[],
    "backchannelLogoutUri" TEXT,
    "backchannelLogoutSessionRequired" BOOLEAN,
    "tokenEndpointAuthMethod" TEXT,
    "applicationType" TEXT,
    "jwks" TEXT,
    "jwksUri" TEXT,
    "grantTypes" TEXT[],
    "responseTypes" TEXT[],
    "requirePKCE" BOOLEAN,
    "dpopBoundAccessTokens" BOOLEAN DEFAULT false,
    "referenceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "OauthClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthResource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" TEXT[],
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN DEFAULT false,
    "disabled" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "policyVersion" INTEGER DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "OauthResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthClientResource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OauthClientResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "rotationReplayResponse" TEXT,
    "rotationReplayExpiresAt" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "OauthRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthAccessToken" (
    "id" TEXT NOT NULL,
    "token" TEXT,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "OauthAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthConsent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "OauthConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthClientAssertion" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OauthClientAssertion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Jwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "Jwks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OauthClient_clientId_key" ON "OauthClient"("clientId");
CREATE INDEX "OauthClient_userId_idx" ON "OauthClient"("userId");

CREATE UNIQUE INDEX "OauthResource_identifier_key" ON "OauthResource"("identifier");

CREATE INDEX "OauthClientResource_clientId_idx" ON "OauthClientResource"("clientId");
CREATE INDEX "OauthClientResource_resourceId_idx" ON "OauthClientResource"("resourceId");

CREATE UNIQUE INDEX "OauthRefreshToken_token_key" ON "OauthRefreshToken"("token");
CREATE INDEX "OauthRefreshToken_clientId_idx" ON "OauthRefreshToken"("clientId");
CREATE INDEX "OauthRefreshToken_userId_idx" ON "OauthRefreshToken"("userId");
CREATE INDEX "OauthRefreshToken_sessionId_idx" ON "OauthRefreshToken"("sessionId");
CREATE INDEX "OauthRefreshToken_authorizationCodeId_idx" ON "OauthRefreshToken"("authorizationCodeId");

CREATE UNIQUE INDEX "OauthAccessToken_token_key" ON "OauthAccessToken"("token");
CREATE INDEX "OauthAccessToken_clientId_idx" ON "OauthAccessToken"("clientId");
CREATE INDEX "OauthAccessToken_userId_idx" ON "OauthAccessToken"("userId");
CREATE INDEX "OauthAccessToken_sessionId_idx" ON "OauthAccessToken"("sessionId");
CREATE INDEX "OauthAccessToken_refreshId_idx" ON "OauthAccessToken"("refreshId");
CREATE INDEX "OauthAccessToken_authorizationCodeId_idx" ON "OauthAccessToken"("authorizationCodeId");

CREATE INDEX "OauthConsent_clientId_idx" ON "OauthConsent"("clientId");
CREATE INDEX "OauthConsent_userId_idx" ON "OauthConsent"("userId");

ALTER TABLE "OauthClient" ADD CONSTRAINT "OauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthClientResource" ADD CONSTRAINT "OauthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthClientResource" ADD CONSTRAINT "OauthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "OauthResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthRefreshToken" ADD CONSTRAINT "OauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthRefreshToken" ADD CONSTRAINT "OauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OauthRefreshToken" ADD CONSTRAINT "OauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "OauthRefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OauthConsent" ADD CONSTRAINT "OauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthConsent" ADD CONSTRAINT "OauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Audit-Log: Quelle des Zugriffs (z. B. Assistent: Claude für OAuth-Bearer-Tokens)
ALTER TABLE "TaxDataAccessLog" ADD COLUMN "source" TEXT;

