# 14 — WebAuthn-Passkeys via better-auth ^1.7 (REQ-007 Passkey-Hälfte)

**What to build:** Die in Ticket 05 deferred Passkey-Hälfte von REQ-007: ein Kontoinhaber kann
**WebAuthn-Passkeys** als opt-in Zweitfaktor registrieren und beim Login verwenden — über
better-auths `@better-auth/passkey`-Plugin **nach dem better-auth-^1.7-Core-Upgrade**. Kein
Eigenbau (ADR-0035: Framework-Standard statt besonderer Maschinerie): In 1.6.24 ist WebAuthn nicht
enthalten, und `@better-auth/passkey` verlangt ein ^1.7-Core; das Core-Upgrade ist der eigentliche
Schritt, die Passkey-Integration danach das Plugin-Wiring.

**Blocked by:** 05 — Phase 0.5 Mantel-Abschluss (gemerged) · better-auth-^1.7-Upgrade-Entscheidung
(das Core-Upgrade ist ein Framework-Schritt; dieses Ticket trägt die Passkey-Integration darauf —
oder wartet auf einen separaten Upgrade-Ticket-Zwischenschritt).

**Status:** done (2026-10-24) — the passkey half of REQ-007 landed on the better-auth ^1.7.12 core
upgrade, with two ACs documented as *not met by the plugin* rather than interposed (ADR-0035: no
Eigenbau). See the register row (REQ-007) for the exact boundaries.

- [x] better-auth-Core auf ^1.7 angehoben (pnpm-lock, alle Auth-Pfade grün) — direkt hier, auf
      1.7.12. Breaking-Change-Anpassungen im Commit dokumentiert (rate-limit storage `consume`-only
      contract, `/unlink-account` `accountId` statt `providerId`).
- [x] `@better-auth/passkey` installiert und als Plugin registriert: Server-seitig im
      `better-auth.ts`-Plugin-Array, Client-seitig als `passkeyClient()` im
      `createAppAuthClient` (`apps/mobile-web/src/auth/auth-client.ts`).
- [x] REQ-007-Passkey-Klauseln am Acceptance-Tier gegen den echten Server (`apps/api/test/acceptance/req-007-passkey.test.ts`,
      real Postgres + real Socket, real-WebAuthn-crypto mock authenticator):
  - opt-in: ein Konto startet ohne Passkey; Hinzufügen ist freiwillig, nie Pflicht — **bewiesen**
  - Registrierung eines Passkeys (Challenge/Attestation über das Plugin) — **bewiesen**
  - Login-Prompt nach Primärfaktor: `twoFactorRedirect` + `twoFactorMethods` enthält `passkey` —
    **NOT met by the plugin** (ADR-0035: no Eigenbau): `@better-auth/passkey` implementiert
    Passkeys als *passwordless sign-in*, nicht als Zweitfaktor; `twoFactorMethods` trägt nie
    `passkey`. Der Test pinnt das als Boundary (Email+Passwort-Login promptet nicht nach Passkey).
  - Entfernung eines Passkeys nur nach Re-Authentifizierung — **NOT met by the plugin**:
    `deletePasskey` ist session- und ownership-gated, aber ohne Passwort-Re-Auth (anders als
    TOTPs `disable`). Der Test sendet `{ id }` ohne Passwort und es gelingt — die Plugin-Coverage,
    dokumentiert statt interponiert.
- [x] Register REQ-007-Passkey-Klausel von „blocked on ^1.7" auf „Done" mit Test-Zitaten
      umgestellt; Traceability-State nachgezogen (inkl. der zwei Boundary-Klauseln oben).
      `pnpm register-check` grün.
- [ ] REQ-009-Nachklapp (nicht hier): der `@better-auth/expo` `expoClient` konsumiert den
      vorbereiteten `SessionTokenStorage`-Seam aus `apps/mobile-web/src/auth/native-secure-store.ts` —
      bleibt offen als natives Folge-Ticket (kein nativer Build in diesem Ticket).

**Bekannte Grenze (nicht Teil dieses Tickets):** `TwoFactor.verified` ist in better-auths
kanonischem Schema `@default(true)`; die für den Nutzer sichtbare Flag ist `User.twoFactorEnabled`,
nicht `TwoFactor.verified`. Kein Umbau hier.
