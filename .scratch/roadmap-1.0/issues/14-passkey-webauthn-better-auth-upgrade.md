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

**Status:** ready-for-agent

- [ ] better-auth-Core auf ^1.7 angehoben (pnpm-lock, alle Auth-Pfade grün) — direkt hier oder
      als eigener Upgrade-Zwischenschritt, auf den dieses Ticket dann wartet
- [ ] `@better-auth/passkey` installiert und als Plugin registriert: Server-seitig im
      `better-auth.ts`-Plugin-Array, Client-seitig als `passkeyClient()` im
      `createAppAuthClient` (`apps/mobile-web/src/auth/auth-client.ts`)
- [ ] REQ-007-Passkey-Klauseln am Acceptance-Tier gegen den echten Server (Muster
      `apps/api/test/acceptance/req-007-totp.test.ts`, real Postgres + real Socket):
  - opt-in: ein Konto startet ohne Passkey; Hinzufügen ist freiwillig, nie Pflicht
  - Registrierung eines Passkeys (Challenge/Attestation über das Plugin)
  - Login-Prompt nach Primärfaktor: `twoFactorRedirect` + `twoFactorMethods` enthält `passkey`
  - Entfernung eines Passkeys nur nach Re-Authentifizierung (falsches Passwort wird abgewiesen)
- [ ] Register REQ-007-Passkey-Klausel von „blocked on ^1.7" auf „Done" mit Test-Zitaten
      umgestellt; Traceability-State nachgezogen (das `twoFactorRedirect`-Prompt-Zitat der
      TOTP-Hälfte gilt dann für `passkey` mit)
- [ ] REQ-009-Nachklapp (falls hier, nicht eigenes natives Ticket): der `@better-auth/expo`
      `expoClient` konsumiert den vorbereiteten `SessionTokenStorage`-Seam aus
      `apps/mobile-web/src/auth/native-secure-store.ts` — damit ist der Seam kein reiner
      Vorbereitungs-Integrationspunkt mehr. Sonst: dieses Ticket referenziert das native Ticket.

**Bekannte Grenze (nicht Teil dieses Tickets):** `TwoFactor.verified` ist in better-auths
kanonischem Schema `@default(true)`; die für den Nutzer sichtbare Flag ist `User.twoFactorEnabled`,
nicht `TwoFactor.verified`. Kein Umbau hier.
