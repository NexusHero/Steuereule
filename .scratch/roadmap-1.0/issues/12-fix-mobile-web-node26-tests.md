# 12 — Fix: mobile-web-Tests grün unter Node v26 (localStorage-Spy)

**What to build:** Die zwei unter Node 26 roten Test-Suiten in `apps/mobile-web`
(`ProfilScreen.test.tsx`, `req-012-onboarding-vertical-join.test.tsx`) laufen wieder grün —
unabhängig von der lokalen Node-Version (26 lokal, 24 in CI). Befund aus Ticket 01:
`vi.spyOn(window.localStorage, 'setItem')` scheitert mit „spyOn could not find an object to
spy upon", weil Node 26 ein globales `localStorage` bereitstellt, das die Testumgebung nicht
kontrolliert. Fix gehört in die Test-Setup-Schicht, nicht in Produktcode.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Ursache diagnostiziert und in der Test-Setup-Schicht behoben (`test-setup.ts` o. ä.);
      kein Produktcode angefasst
- [x] `pnpm -r test` lokal unter Node 26 grün (alle Workspaces; nach Rebase auf origin/main:
      mobile-web 379 Tests, api 333, core 116, ui 57, tokens 45, api-client 9 — alles grün)
- [x] CI-Pfad (Node 24) bleibt grün — Fix ist versionsunabhängig (data property ersetzt den
      Accessor unter beiden Versionen; CI verifiziert beim Push)
- [x] `typecheck` + `oxlint` grün; warum-Kommentar, keine Kommentarwüste
- [x] Ticket 01: Blocker „pnpm gate rot (AC 3)" wird damit geschlossen — AC in
      `01-p0-1-hygiene.md` abhaken

**Befund zur Ehrlichkeit:** Ein einmaliger Fehler in `App.test.tsx` (account-deletion-Flow)
trat nur im ersten Voll-Parallel-Lauf auf und reproduzierte sich nicht (isoliert 379/379,
zweiter Voll-Lauf 379/379) — vorbestehende Flake-Klasse (CPU-Kontention), die das Remote in
`test-setup.ts` bereits mit angehobenem `asyncUtilTimeout` dokumentiert hat. Nicht Teil dieses
Tickets, aber protokolliert.
