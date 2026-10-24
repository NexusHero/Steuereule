# Review — Ticket 02, Phase 0.2 Framework-Ersatz (Branch `ticket-02-p0-2-framework-ersatz`, HEAD 194d74a)

**Reviewer:** Musti (Lead/Architect) · **Datum:** 2026-10-23 · **Scope:** read-only, `git diff main...HEAD`

## 1. Verdict

**REQUEST-CHANGES** — eng begrenzt auf DoD-/Register-Hygiene, nicht auf Code-Korrektheit.

Der Kern der Arbeit ist fachlich sauber und überdurchschnittlich gut getestet:
Throttler-Werte decken die alten Limits exakt, die Write-Amplification-Begrenzung wird
bewiesen (nicht nur „Guard vorhanden"), der Device-Cookie-Round-Trip läuft durch die echte
better-auth-Instanz, und trustProxy ist eine einzige Quelle mit Breadth-Guard. Die beiden
dokumentierten Abweichungen (per-Pod-Limits, e2e-Harness) sind **ehrlich und sichtbar** — aber
nach ADR-0036 D20 müssen sie zusätzlich **im Register** stehen und einen **konkreten
Nachhol-Ticket-Link** tragen. Genau das fehlt (Findings F1/F2). Kein Code-Nacharbeitsbedarf,
nur zwei Zeilen Register-Pflege + ein Folge-Ticket.

## 2. Findings

### F1 — e2e-Harness ist garantiert rot, Abweichung nur im Ticket, ohne Folge-Ticket und ohne Register-Eintrag (MEDIUM)
- **Ort:** `e2e/harness/rate-limit.mjs:44` und `:52` (liest `SELECT … FROM "RateLimit"`),
  Konsumenten `device-authorization.mjs`, `session/return-visit.mjs` u. a.
- **Befund:** Die Migration `20261023192253_drop_rate_limit_table` löscht die Tabelle, die
  dieses Harness liest. Zusätzlich passen die vom Harness gelesenen Key-Formen
  (`device-code:*`/`device-pending:*`, `no-trusted-ip|<path>`) **doppelt nicht mehr**: die
  device/pending-Limiter laufen jetzt über `@nestjs/throttler` mit SHA-256-Key
  (`generateKey`), better-auths Limiter über den In-Memory-`customStorage` statt der Tabelle.
  Der „Browser gates"-Job ist damit garantiert rot.
- **Bewertung:** Die Abweichung ist im Ticket (`.scratch/…/02-p0-2-framework-ersatz.md:65-68`)
  ehrlich als „außerhalb dieses Tickets, als Folge-Arbeit zu schneiden" benannt — **nicht
  versteckt**. Aber: (a) es existiert **kein Folge-Ticket** (grep über
  `.scratch/roadmap-1.0/issues/` findet nur `02` selbst), (b) das Register
  (`docs/requirements/register.md`) wurde **nicht** angefasst. Beides verletzt ADR-0036 D20
  („recorded visibly in the PR **and** the register … with a follow-up ticket").
- **Vorschlag:** Ein Folge-Ticket anlegen (e2e-Bucket-Substrat neu aufsetzen, z. B. gegen den
  Redis-Storage aus #292) und dessen Nummer sowohl im Ticket als auch im Register REQ-010/014
  referenzieren; Register-Eintrag ergänzen.

### F2 — In-memory-Statt-DB-Abweichung nur im Ticket + Code, nicht im Register (LOW/MEDIUM)
- **Ort:** `apps/api/src/rate-limit/rate-limit.ts:8-16` (Abweichungs-Kommentar), Ticket
  `.scratch/…/02-*.md:58-64`; **fehlt** in `docs/requirements/register.md` und
  `docs/adr/0012-*.md` (§5 sagt weiterhin „DB-backed").
- **Befund:** Die Abweichung von ADR-0012 §5 („DB-backed") ist in Code-Kommentar + Ticket
  dokumentiert und mit Redis-Nachhol auf #292 verknüpft — das ist gut. Aber D20 verlangt den
  Eintrag **auch im Register**; der fehlt, und ADR-0012 §5 selbst wurde nicht amended (ein
  Amendment ist nicht zwingend nötig, aber der Register-Pflege-Pflicht ist nicht genügt).
- **Vorschlag:** REQ-010-Zeile im Register um den Vermerk „Storage DB→In-Memory (ADR-0035),
  per-Pod-Zählung, Redis-Nachhol via #292" ergänzen.

### F3 — `customStorage` verliert better-auths Memory-Bound/Eviction (LOW)
- **Ort:** `apps/api/src/auth/rate-limit-storage.ts:30-56` (`consume`).
- **Befund:** `consume` repliziert `decideConsume` **korrekt** (atomar, Sliding-Window,
  `retryAfter`-Formel identisch). Es übernimmt aber **nicht** die beiden Schutzmechanismen von
  better-auths eingebautem Memory-Store: dessen `consume` löscht abgelaufene Einträge
  (`Date.now() >= expiresAt`) und hält einen `MEMORY_STORE_MAX_ENTRIES = 1e5`-Deckel. Der
  eigene `Map` wächst also in einem langlebigen Prozess unbegrenzt (ein Eintrag pro je
  gesehenem `${ip}|${path}`). Kein Korrektheitsbug (abgelaufene Keys werden beim nächsten
  `consume` korrekt auf `count:1` zurückgesetzt), aber eine Unbounded-Memory-Regression
  gegenüber dem eingebauten Store.
- **Vorschlag:** Entweder abgelaufene Einträge in `consume` löschen (wie der eingebaute Store)
  oder einen Größen-Deckel nachziehen; mindestens als bewusste Entscheidung kommentieren.

### F4 — Breadth-Guard-Schwelle wird kommentiert, nicht am echten Fastify-Adapter belegt (INFO)
- **Ort:** `apps/api/src/config/trusted-proxies.ts:27-33` (`MIN_TRUSTED_PROXY_PREFIX_LENGTH=2`),
  `apps/api/test/trusted-proxies.test.ts:61-68`.
- **Befund:** Der Unit-Test belegt, dass der Resolver `/0`/`/1` ablehnt und `/2` akzeptiert —
  also die **Konfigurations**-Ebene. Dass `/1` tatsächlich die fail-open-Grenze des echten
  `@fastify/proxy-addr` ist (und `/2` sicher), steht nur als Kommentar
  („measured against @fastify/proxy-addr@5.1.0"). Die AC-Formulierung („durch Konfiguration +
  Test geschlossen") ist damit auf der Konfig-Ebene erfüllt; die zugrundeliegende
  fail-open-Messung wird hier nicht erneut rot/grün bewiesen, sondern referenziert.
- **Vorschlag:** Entweder einen (billigen) Integrationstest, der `trustProxy: ['0.0.0.0/1']`
  gegen einen echten `FastifyAdapter` mit gespooftem XFF fährt und die Rückgabe der
  Spoof-Adresse beweist — oder die Kommentar-Referenz auf die Messung aus #241 explizit als
  „nicht erneut verifiziert" kennzeichnen. Kein Blocker.

### F5 — Behauptung „7 Integration-Fehler vorbestehend" nicht re-verifizierbar (INFO)
- **Ort:** Commit-Message 194d74a (keine Test-Zahlen), Ticket-Deviation
  `.scratch/…/02-*.md:69-72`.
- **Befund:** Die genannten Ursachen sind plausibel und decken sich mit dem Code:
  `EADDRNOTAVAIL` = der `localAddress: '127.0.0.2'`-Bind des device-code-Tests
  (`req-014-device-code.integration.test.ts:61-74`), der auf macOS ohne `sudo ifconfig lo0
  alias` scheitert; Chromium = PDF-/Playwright-Tests. Ein **Baseline-Vergleich gegen `main`**
  (dass dieselben 7 Fehler dort ebenfalls rot sind) ist aber weder in der Commit-Message noch
  im Ticket festgehalten.
- **Vorschlag:** Baseline-Nachweis (z. B. „gleiche 7 Fehler auf `main` bei identischer
  Umgebung") in Ticket oder PR-Body ergänzen; andernfalls im Review als „nicht re-verifiziert"
  führen.

## 3. Nicht re-verifizierte Punkte

- **Gates (unit/integration/typecheck/lint/register-check/adr-check):** nicht neu ausgeführt
  (bewusst langsam). Der Agent-Befund „329 unit grün" ist mangels Lauf nicht bestätigt; die
  „7 Integration-Fehler vorbestehend"-Behauptung ist nur plausibilisiert (F5), nicht belegt.
- **`@fastify/proxy-addr`-fail-open bei `/0`/`/1`:** als Kommentar-Messung übernommen, nicht
  an der echten Adapter-Version in diesem PR erneut gemessen (F4).
- **Redis-Nachhol (#292) und e2e-Bucket-Neuaufsetzung:** reine Folge-Arbeiten, inhaltlich
  nicht geprüft (noch nicht existent).

## 4. Positiv vermerkt (keine Findings)

- **Throttler-Schutzäquivalenz exakt:** `DEVICE_CODE` 60s/10, `DEVICE_PENDING` 60s/10,
  `VERIFY_PASSWORD` 10s/3 per Account via `getTracker`-Override — bestätigt gegen
  `@nestjs/throttler@6.7.1`-Typen (per-route `getTracker` wird vom Guard gelesen,
  `throttler.guard.js:94`).
- **Write-Amplification bewiesen:** `req-014-device-code.integration.test.ts:192-209` prüft
  (1) 11. Mint → 429, (2) exakt 10 Zeilen (kein insert-then-429), (3) andere IP → 201.
- **Device-Cookie-Round-Trip:** `req-014-device-approve-token.integration.test.ts:118-188`
  führt den echten `get-session`-Round-Trip + HttpOnly/Max-Age + Revocation durch. Hook feuert
  genau einmal (eine `after`-Regel, `if (!data) return`, `/device/token`-Handler liefert nur
  Bearer). `dontRememberToken`-Zweig bleibt über better-auths eigenes `setSessionCookie`
  erhalten (liest signiertes `dont_remember`-Cookie, im Fresh-Device-Flow immer abwesend →
  persistenter 7-Tage-Cookie wie zuvor).
- **Kein neuer Eigenbau, Warum-Kommentare, Konventionen:** `@nestjs/throttler` +
  `setSessionCookie` sind Framework-Standard; `SESSION_COOKIE_ATTRIBUTES` weiter genutzt
  (nicht tot); Migration ist Prisma-generiert (DROP TABLE der reinen Counter-Tabelle ist
  verlustfrei für Nutzdaten und im Ticket/Code begründet); Commit `refactor(api): …`, Autor
  NexusHero, Co-Author Robin, kein Tool-Footer.
