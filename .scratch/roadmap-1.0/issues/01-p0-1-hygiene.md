# 01 — Phase 0.1: Hygiene

**What to build:** Das Repo ist auf einen technisch sauberen, reviewbar-beweisbaren Grundzustand
gebracht: ein Lockfile (pnpm), vollständige `.gitignore`, alle Gates grün auf `main`, und die
DoD-Checkliste (inkl. Security/Performance-Posture-Zeile) ist als abhakbare Liste im
PR-Template verankert. Danach kann jede weitere Änderung nach der neuen DoD abgenommen werden.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `package-lock.json` entfernt **und** in `.gitignore` eingetragen (verhindert
      Neuerzeugung durch `npm install`); `pnpm-lock.yaml` alleiniges Lockfile; CI nutzt pnpm
- [x] `.gitignore` vollständig (`.DS_Store` u. a.); untracked Müll entfernt
- [ ] `pnpm gate` (typecheck + tests) und `pnpm lint` grün auf `main`
      — **teilweise:** `typecheck` grün (7/8 Workspaces, keine Fehler), `lint`
      (`oxlint --deny-warnings`) grün; `test` rot in `apps/mobile-web` mit 2 **vorbestehenden**
      Suiten (`ProfilScreen.test.tsx`, `req-012-onboarding-vertical-join.test.tsx`):
      `vi.spyOn(window.localStorage, 'setItem')` wirft „spyOn could not find an object to spy
      upon" unter Node v26 (globales `localStorage` ohne `--localstorage-file`; CI läuft auf
      Node 24 und ist nicht betroffen). Nicht gefixt — Ticket ist Hygiene, kein Bugfixing.
      Blocker dokumentiert (progress.db, Kontext „P0 Foundation"). Wird durch Ticket 12 geschlossen.
- [x] PR-Template enthält die DoD-Checkliste aus ADR-0036 (Posture-Zeile inklusive)
- [x] `docs/process/README.md` verlinkt die DoD (vier Ebenen)

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
