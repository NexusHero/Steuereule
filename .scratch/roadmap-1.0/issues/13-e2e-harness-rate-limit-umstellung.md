# 13 — e2e-Harness: Rate-Limit-Umstellung von DB-Read auf Throttler-Verhalten

**What to build:** Das „read the real `RateLimit` row, never truncate it"-Substrat in
`e2e/harness/rate-limit.mjs` (und dessen Konsumenten) liest eine Tabelle, die es seit Ticket 02
nicht mehr gibt: die Migration `20261023192253_drop_rate_limit_table` hat die `RateLimit`-Tabelle
gelöscht, und die Key-Formen passen doppelt nicht mehr — die device/pending-Limiter laufen jetzt
über `@nestjs/throttler` (SHA-256-Key via `generateKey` statt `device-code:*`/`device-pending:*`),
better-auths Limiter über den In-Memory-`customStorage` statt `no-trusted-ip|<path>` in der
Tabelle. Der „Browser gates"-Job ist damit garantiert rot.

Der Harness wird von DB-Reads auf die Beobachtung des **Throttler-Verhaltens** umgestellt: Statt
`SELECT … FROM "RateLimit"` zu lesen, pacen sich die Skripte gegen die echte 429-Antwort bzw. gegen
das in-memory Bucket, das `@nestjs/throttler` und better-auths `customStorage` jetzt halten. Die
„read, never truncate"-Disziplin bleibt als Prinzip erhalten — nur ihr Substrat wechselt von der
Tabelle auf das Throttler-Verhalten (ein neues Bucket-Substrat, ggf. gegen den Redis-Storage aus
#292, sobald der Infra-Track ihn liefert).

**Blocked by:** 02 — Phase 0.2 Framework-Ersatz (gemerged)

**Status:** ready-for-agent

- [ ] `e2e/harness/rate-limit.mjs` liest kein `"RateLimit"`-SQL mehr; `readBucketByExactKey` /
      `readBucketByPrefix` / `waitForBucketHeadroom` werden durch Throttler-Verhaltens-Helfer
      ersetzt oder entfernt (kein toter DB-Read-Pfad, keine „no such table `RateLimit`"-Referenz).
- [ ] Alle Konsumenten (`e2e/device/device-authorization.mjs`, `e2e/session/return-visit.mjs`,
      `e2e/responsive/breakpoint-layout.mjs`, `e2e/responsive/banner-ds-qa.mjs`,
      `e2e/storage/no-client-persistence.mjs`, …) pacen sich gegen das reale 429-Verhalten statt
      gegen Tabellenzeilen; der „Browser gates"-Job läuft grün.
- [ ] `e2e/harness/README.md` schreibt die „The `RateLimit` table is never truncated…"-Sektion auf
      das neue Substrat um (Bucket-Zustand lesen, nie löschen — jetzt in-memory/Throttler statt
      Tabelle).
- [ ] Referenz auf das zu beobachtende Verhalten sind die Throttler-Tests aus Ticket 02:
      `apps/api/test/acceptance/req-014-device-code.integration.test.ts` (11. Mint → 429, exakt
      10 Zeilen, andere IP → 201 — die write-amplification-Begrenzung) und
      `apps/api/test/acceptance/req-014-device-approve-token.integration.test.ts` (pending-Limiter
      feuert); die Reset-Naht ist `apps/api/test/support/reset-rate-limiters.ts`.
- [ ] Optional (hierher verschoben aus Ticket-02-F4): Integrationstest gegen den echten
      `FastifyAdapter`, der `trustProxy: ['0.0.0.0/1']` mit gespooftem XFF fährt und die
      fail-open-Rückgabe der Spoof-Adresse beweist — die Unit-Ebene liegt in
      `apps/api/test/trusted-proxies.test.ts`.

**Bekannte Grenze (nicht Teil dieses Tickets, kein Umbau):** `apps/api/src/auth/rate-limit-storage.ts`'s
in-memory `Map` wächst in einem langlebigen Prozess unbegrenzt (ein Eintrag pro gesehenem
`${ip}|${path}`) — es fehlen better-auths eingebauter `MEMORY_STORE_MAX_ENTRIES`-Deckel und die
Eviction abgelaufener Einträge. Kein Korrektheitsbug (abgelaufene Keys werden beim nächsten
`consume` korrekt auf `count:1` zurückgesetzt), aber eine Unbounded-Memory-Regression gegenüber dem
eingebauten Store. Wird durch den Redis-Nachhol (#292) aufgelöst, nicht hier.
