# 02 — Phase 0.2: Framework-Ersatz (feste Liste)

**What to build:** Alle besprochenen Eigenbauten sind durch Framework-/Library-Standard ersetzt,
ohne Verhaltensregression. Danach enthält der Auth-/Geräte-/Proxy-Pfad keinen nachgebauten
Mechanismus mehr, den NestJS/better-auth/Fastify bereits liefert.

**Blocked by:** 01 — Phase 0.1: Hygiene

**Status:** done (Robin) — siehe „Deviations/Follow-ups" unten für offene Punkte.

- [x] Drei handgerollte Rate-Limiter (`device-code`, `device-pending`, `verify-password`) +
      eigene `RateLimit`-Tabelle ersetzt durch `@nestjs/throttler`; bestehende
      Acceptance-Tests (inkl. der „write-amplification"-Begründung aus PR #239) bleiben grün
      oder werden begründet angepasst
- [x] `trusted-proxies.ts`-Resolver abgelöst durch Fastify `trustProxy`, **eine**
      Konfigurationsquelle; better-auth-`trustedProxies` konsumiert dieselbe Quelle;
      Fail-open/fail-closed-Asymmetrie (ADR-Doku aus #241) wird durch Konfiguration + Test
      geschlossen statt durch Kommentar
- [x] better-auth-Device-Plugin setzt sein Session-Cookie selbst (`setSessionCookie`);
      `session-cookie.ts`-Format-Nachbau entfällt komplett; REQ-014-Acceptance-Tests grün
- [x] Prüfung weiterer Eigenbauten gegen NestJS-Standard (`validation-exception-factory`,
      `assert-database-reachable`, Fehler-/Cookie-Helfer): jeder Ersatz mit ADR-Eintrag
      oder bewusster Beibehaltungs-Begründung
- [x] Kein neuer Mechanismus ohne ADR (DoD: kein Eigenbau)

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._

## Wie umgesetzt (Robin, 2026-10-23)

- **Rate-Limiter:** `apps/api/src/rate-limit/rate-limit.ts` deklariert die drei Limits
  (device-code 60s/10, device-pending 60s/10, verify-password 10s/3) + den
  per-account-`verifyPasswordTracker`. `@Throttle` + `@UseGuards(ThrottlerGuard)` sitzen
  auf `DeviceController.code/pending` und `AccountDeletionController.deleteAccount`.
  Gelöscht: `db-rate-limit.ts`, `device-code-rate-limit.ts`, `device-pending-rate-limit.ts`,
  `verify-password-rate-limit.ts`, die `RateLimit`-Tabelle (Migration
  `20261023192253_drop_rate_limit_table`) und `test/db-rate-limit.integration.test.ts`.
  better-auths eigener Limiter läuft auf einem resettbaren `customStorage`
  (`apps/api/src/auth/rate-limit-storage.ts`, atomarer `consume`), weil better-auths
  Default-Memory-Store eine modulweite, nicht rücksetzbare Map ist.
- **trustProxy:** `resolveTrustedProxies()` ist die eine Quelle, die sowohl
  `FastifyAdapter({ trustProxy })` (main.ts) als auch better-auths `trustedProxies`
  konsumiert. Die fail-open-Asymmetrie wird durch einen Breadth-Guard (Präfix < /2 wird
  abgelehnt) + Unit-Test geschlossen — `/0`/`/1` fail-open bei proxy-addr, `/2`+ nicht.
- **Session-Cookie:** `apps/api/src/auth/device-session-cookie.ts` (better-auth-Plugin,
  `after`-Hook auf `/device/token`) ruft better-auths eigenes `setSessionCookie` auf; der
  Controller schreibt die `Set-Cookie`-Header roh durch. `session-cookie.ts` gelöscht.
- **Weitere Eigenbauten (behalten, Ein-Zeilen-Begründung):**
  - `validation-exception-factory.ts` — NestJS-Standard-`exceptionFactory`-Hook, kein
    Nachbau: formt nur das 400-Body-Schema (`fields[]`) und liest bewusst nie `.value`
    (Steuer-ID leakt nie in Body/Log).
  - `assert-database-reachable.ts` — NestJS hat kein Äquivalent (kein Boot-Guard mit
    Redaktion/12-Factor-Fail-fast); bleibt als bewusster Boot-Guard.
  - `device-api-error.ts` / `guest-session.ts` — Integrations-/Domänen-Nähte (better-auth
    `APIError`→Nest; ADR-0007-Gast-Cookie vor Keycloak), keine Framework-Nachbauten.

## Deviations / Follow-ups

1. **In-memory statt DB-backed (Rate-Limit) — dokumentierte Abweichung zu ADR-0012 §5.**
   Die `RateLimit`-Tabelle ist weg; `@nestjs/throttler` (Default-Speicher) und better-auth
   (resettbarer `customStorage`) zählen **per Pod**. Horizontale Skalierung kann das Limit
   über mehrere Pods verteilen (N× pro Key). Die write-amplification-Begrenzung des
   Device-Code-Endpoints (PR #239) gilt weiterhin **pro Quelle pro Pod**. Nachhol-Ticket:
   Redis-gespeicherte Limiter (`@nestjs/throttler`-Redis-Storage + better-auth
   `secondaryStorage`), sobald der Infra-Track (#292) Redis liefert.
2. **e2e-Harness liest `RateLimit`-Tabelle** (`e2e/harness/rate-limit.mjs` + Konsumenten
   `device-authorization.mjs`, `session/return-visit.mjs`, …). Die Tabelle existiert nicht
   mehr; die „read, never truncate"-Disziplin braucht ein neues Bucket-Substrat. **Außerhalb
   dieses Tickets** (e2e/„Browser gates"-Job) → **Folge-Ticket 13 — e2e-Harness:
   Rate-Limit-Umstellung** (`.scratch/roadmap-1.0/issues/13-e2e-harness-rate-limit-umstellung.md`).
3. **Lokaler macOS-Testlauf:** `req-014-device-code`'s `127.0.0.2`-Quell-IP
   (`localAddress`) bindet ohne `sudo ifconfig lo0 alias` nicht (Linux-CI hat ganz 127/8).
   Chromium fehlt lokal → PDF-/Playwright-Tests rot. Beides umweltbedingt, nicht durch dieses
   Ticket; auf Linux-CI grün.
