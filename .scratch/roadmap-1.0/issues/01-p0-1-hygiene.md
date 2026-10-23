# 01 — Phase 0.1: Hygiene

**What to build:** Das Repo ist auf einen technisch sauberen, reviewbar-beweisbaren Grundzustand
gebracht: ein Lockfile (pnpm), vollständige `.gitignore`, alle Gates grün auf `main`, und die
DoD-Checkliste (inkl. Security/Performance-Posture-Zeile) ist als abhakbare Liste im
PR-Template verankert. Danach kann jede weitere Änderung nach der neuen DoD abgenommen werden.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `package-lock.json` entfernt **und** in `.gitignore` eingetragen (verhindert
      Neuerzeugung durch `npm install`); `pnpm-lock.yaml` alleiniges Lockfile; CI nutzt pnpm
- [ ] `.gitignore` vollständig (`.DS_Store` u. a.); untracked Müll entfernt
- [ ] `pnpm gate` (typecheck + tests) und `pnpm lint` grün auf `main`
- [ ] PR-Template enthält die DoD-Checkliste aus ADR-0029-Entwurf (Posture-Zeile inklusive)
- [ ] `docs/process/README.md` verlinkt die DoD (vier Ebenen)

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
