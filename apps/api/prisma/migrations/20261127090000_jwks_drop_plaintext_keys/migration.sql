-- ADR-0106 D6: the JWKS private key is now stored encrypted under BETTER_AUTH_SECRET. Keys written before
-- were stored as a plaintext JWK object; better-auth can no longer read them and would fail to sign.
-- Drop them: the jwt plugin mints a new, encrypted key on the next signature. Access tokens signed with an
-- old key (15 minutes) stop verifying, and the assistant refreshes them with its refresh token.
DELETE FROM "Jwks" WHERE "privateKey" LIKE '{%';
