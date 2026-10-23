# 02 — Phase 0.2: Framework-Ersatz (feste Liste)

**What to build:** Alle besprochenen Eigenbauten sind durch Framework-/Library-Standard ersetzt,
ohne Verhaltensregression. Danach enthält der Auth-/Geräte-/Proxy-Pfad keinen nachgebauten
Mechanismus mehr, den NestJS/better-auth/Fastify bereits liefert.

**Blocked by:** 01 — Phase 0.1: Hygiene

**Status:** ready-for-agent

- [ ] Drei handgerollte Rate-Limiter (`device-code`, `device-pending`, `verify-password`) +
      eigene `RateLimit`-Tabelle ersetzt durch `@nestjs/throttler`; bestehende
      Acceptance-Tests (inkl. der „write-amplification"-Begründung aus PR #239) bleiben grün
      oder werden begründet angepasst
- [ ] `trusted-proxies.ts`-Resolver abgelöst durch Fastify `trustProxy`, **eine**
      Konfigurationsquelle; better-auth-`trustedProxies` konsumiert dieselbe Quelle;
      Fail-open/fail-closed-Asymmetrie (ADR-Doku aus #241) wird durch Konfiguration + Test
      geschlossen statt durch Kommentar
- [ ] better-auth-Device-Plugin setzt sein Session-Cookie selbst (`setSessionCookie`);
      `session-cookie.ts`-Format-Nachbau entfällt komplett; REQ-014-Acceptance-Tests grün
- [ ] Prüfung weiterer Eigenbauten gegen NestJS-Standard (`validation-exception-factory`,
      `assert-database-reachable`, Fehler-/Cookie-Helfer): jeder Ersatz mit ADR-Eintrag
      oder bewusster Beibehaltungs-Begründung
- [ ] Kein neuer Mechanismus ohne ADR (DoD: kein Eigenbau)

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
