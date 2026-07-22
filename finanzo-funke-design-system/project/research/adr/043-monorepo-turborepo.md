# ADR-043 — Ein Monorepo mit Turborepo

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22

**Kontext:** SteuerEule braucht ein Web-Frontend, eine Mobile-App, einen gemeinsamen
Fachlogik-Kern und ein Backend (ADR-003, ADR-004). Diese Teile teilen Typen, Tokens und
Steuerregeln. Verstreute Repos würden die 1:1-Übernahme des Design-Systems brechen und den
gemeinsamen Kern doppelt pflegen.

**Entscheidung:** Ein einziges Monorepo in genau diesem Repo, als **pnpm-Workspace**,
orchestriert mit **Turborepo** (Task-Caching, Build-Graph für `build`/`lint`/`test`). Layout:

```
packages/  tokens · ui (Design-System) · core (UI-freier TS-Fachkern)
apps/      mobile-web (Expo universal) · marketing (React-DOM) · api (NestJS)
```

Turborepo statt Nx: leichteres Werkzeug, weniger Lock-in; die Aufgabe braucht Task-Caching
und einen Build-Graph, nicht Nx' schwergewichtige Generatoren.

**Konsequenzen:** Ein Talent-Pool für App + Web + DS + Backend (alles TypeScript). Der
`core` und die Domänen-Typen werden von RN, Web und Backend geteilt. CI läuft über den
Turbo-Graph; Caching hält die Pipeline schnell, wenn die Paket-Zahl wächst.
