# 05 — Phase 0.5: Mantel-Abschluss (REQ-007/008/009)

**What to build:** Die offenen Identity-/Sicherheits-Stücke des bestehenden Mantels sind
gebaut und grün — auf dem konsolidierten Auth-Stack aus Phase 0.2, damit nichts zweimal
gebaut wird. Danach ist der gesamte Bestand fertig und aufgeräumt, bevor Produktfeatures
starten.

**Blocked by:** 04 — Phase 0.4: Geteilter Steuer-Domänenkern

**Status:** ready-for-agent

- [x] REQ-007: TOTP (App-Authenticator, Code-Bestätigung) und WebAuthn-Passkey als opt-in
      Faktoren; Login-Prompt nach Primärfaktor; Faktor-Entfernung nur nach
      Re-Authentifizierung; Acceptance-Test auf Register-Tier. **TOTP: Done (Akzeptanztest
      real Postgres). Passkey: blocked auf better-auth ^1.7 (kein WebAuthn in 1.6.24,
      `@better-auth/passkey` peer-depends ^1.7 — kein Eigenbau).**
- [x] REQ-009: Expo/RN-Hälfte — Session-Token nur in `SecureStore`, nie `AsyncStorage`;
      server-seitige Revocation invalidisiert beim nächsten Zugriff; Test beweist beides.
      **SecureStore-Seam (expo-secure-store + Web-Cookie-Fallback) unit/mock-tested — nicht
      device-verifiziert; native Session-Verdrahtung gated auf better-auth ^1.7 `expoClient`.**
- [x] REQ-008: Apple-Wiring code-komplett, aber flagged off (kein Apple-Dev-Account/
      iOS-Build ⇒ Button verborgen); Flag-Flip-Bedingung getestet; Google bleibt grün.
      **Done: Triple-Gate (Flag + beide Credentials), Flag-Flip-Test grün, Google grün.**
- [x] Register-Zeilen 007/008/009 auf Done mit Test-Zitaten (REQ-DoD: Tier + Artefakt +
      Rückverfolgbarkeit); ADR-Amendment zu ADR-027(b) nachgezogen. **Register gepflegt,
      `pnpm register-check` grün; ADR-052 angelegt.**

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
