# 12 — Fix: mobile-web-Tests grün unter Node v26 (localStorage-Spy)

**What to build:** Die zwei unter Node 26 roten Test-Suiten in `apps/mobile-web`
(`ProfilScreen.test.tsx`, `req-012-onboarding-vertical-join.test.tsx`) laufen wieder grün —
unabhängig von der lokalen Node-Version (26 lokal, 24 in CI). Befund aus Ticket 01:
`vi.spyOn(window.localStorage, 'setItem')` scheitert mit „spyOn could not find an object to
spy upon", weil Node 26 ein globales `localStorage` bereitstellt, das die Testumgebung nicht
kontrolliert. Fix gehört in die Test-Setup-Schicht, nicht in Produktcode.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Ursache diagnostiziert und in der Test-Setup-Schicht behoben (`test-setup.ts` o. ä.);
      kein Produktcode angefasst
- [ ] `pnpm -r test` lokal unter Node 26 grün (alle Workspaces)
- [ ] CI-Pfad (Node 24) bleibt grün — kein Fix, der nur unter einer Node-Version hält
- [ ] `typecheck` + `oxlint` grün; warum-Kommentar, keine Kommentarwüste
- [ ] Ticket 01: Blocker „pnpm gate rot (AC 3)" wird damit geschlossen — AC in
      `01-p0-1-hygiene.md` abhaken
