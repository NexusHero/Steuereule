# Gap-Analyse 2026-10-23 — Roadmap 1.0 gegen aktuellen origin/main (8c9a150)

**Befund:** Der Plan (D1–D21, `docs/roadmap-1.0.md`) wurde gegen die lokale Basis `4a82ec5`
gebaut. `origin/main` ist inzwischen **71 Commits weiter** (bis `8c9a150`). Diese Analyse
vergleicht die Phasen-Inhalte mit dem realen Remote-Stand. Die **Entscheidungen** D1–D21
bleiben gültig; betroffen sind nur die Zustandsannahmen der Phasen.

## 1. Was remote bereits gebaut hat (Plan-Anpassung nötig)

| Roadmap-Punkt | Remote-Stand | Konsequenz |
|---|---|---|
| 0.4 Interview-Engine-Gerüst | **Teilweise fertig:** ADR-0031/0033, Fragen-Graph in `packages/core` (`interview.ts`), REQ-015 **Done** (Minimal-Gate Segment 1: 3 Fragen, Server-Validierung, Feldverschlüsselung, Cockpit-Join). Segment 2 (6 Fragen als Katalog-Einstieg, #321) in Arbeit (#341 = Katalog-Entry-Layer R1) | 0.4 **umscope:** Interview-Engine nicht neu bauen, sondern auf Bestand aufsetzen; Kern-Deliverable wird der Rest (Beleg-Schnitt ADR-007/008, deterministischer Rechenkern, KI-Port) |
| Infra-Track | **Angelaufen:** #338 liveness/readiness Health-Endpoints für k3s/Hetzner (`HealthModule` in app.module.ts). Kein `infra/`, keine Deploy-Workflows | track-06-Branch (OpenTofu/Kustomize) bleibt relevant, aber Readiness-Probe muss #338-Endpoints nutzen statt `/v1/auth/capabilities`; Sub-Ticket 06.1 muss #338 als erledigten Teil des Tracks anerkennen |
| Phase 2 M1 Günstigerprüfung | **Noch offen, aber Grundlage da:** ADR-0034 — Veranlagungsartenvergleich existiert, ist explizit *keine* Günstigerprüfung | M1 bleibt Plan-Bestandteil |
| Veranlagungsartenvergleich | Existiert (ADR-0034, bounded comparison) | War implizit in Phase 1/2 enthalten — als Bestand anerkennen |

## 2. Was remote NICHT hat (Plan-Bestandteile bleiben voll gültig)

- **0.2 Framework-Ersatz:** Alle drei Eigenbauten existieren unverändert auf remote
  (`session-cookie.ts`, `db-rate-limit.ts`, `trusted-proxies.ts`), kein `@nestjs/throttler` → **feste Liste voll gültig**
- **0.1 Hygiene:** Remote-`.gitignore` kennt weder `.DS_Store` noch `package-lock.json`
  (nur 2 neue #284-Einträge); kein PR-Template; CI läuft Node 24 → **Ticket 01 voll gültig**
- **0.5 Mantel:** REQ-007 (2FA) not started, REQ-008 Apple ungebaut, REQ-009 Expo-Hälfte offen → **voll gültig**
- **Phase 1:** Angestellte 5 Lebenslagen + Sonderausgaben-Katalog, LStB, Grenzgänger-CH —
  nicht gestartet; nur der Minimal-Gate-Einstieg existiert → **voll gültig, baut auf remote-Engine auf**
- **REQ-010 Rate-Limiting:** weiter „not met", #292 weiter offen → **D7-Plan gültig**
- **#170 Google-Credentials:** weiter offen (README nennt es) → **D22 gültig**
- **fix-12 (Node-26-Tests):** Remote `test-setup.ts` hat keinen localStorage-Mock; CI Node 24 →
  unser Fix ist weiterhin relevant (lokale Dev-Umgebung + Zukunftssicherheit)

## 3. Kollisionen und Konfliktstellen

1. **ADR-Nummern:** Remote hat ADR-0028 („check the effect, not the mechanism") und ADR-0029
   („piggybacked batch sweep"). Unsere → **0035/0036** (Engineering). Research-Log endet bei
   050 → unsere **051 frei**. Kein `.scratch/` oder `docs/roadmap-1.0.md` auf remote → keine
   Ticket-Kollision.
2. **`docs/adr/index.md`:** beide Seiten haben editiert (remote: 0028–0034; wir: 0028/0029) → Rebase-Konflikt, mechanisch lösbar.
3. **`docs/process/README.md`:** existiert remote; unser Ticket-01 editierte es → Konflikt nur, wenn remote es auch änderte (im Rebase prüfen).
4. **Branches:** `ticket-01` (`.gitignore`, PR-Template, docs/process) und `fix-12`
   (`test-setup.ts`) basieren auf `4a82ec5` → Rebase auf neuen main nötig; `track-06`
   (neue `infra/`-Dateien + `deploy.yml`) kollidiert nicht mit remote-Dateien, muss aber
   #338-Health-Endpoints in den Manifests berücksichtigen.

## 4. Empfohlene Rekonziliation (Option A)

1. `main` auf `origin/main` rebasen (unsere 6 Docs-Commits obendrauf), Konflikte lösen
2. ADRs umnummern: 0028→0035, 0029→0036 (Dateien + Status + Indizes + roadmap-Verweise)
3. Roadmap-Dokument um Gap-Befunde ergänzen (Abschnitt „Stand-Sync 2026-10-23": 0.4 teilweise
   remote erledigt, Infra-Track mit #338 gestartet, REQ-015 als neue Basis für Phase 1)
4. Drei Branches auf neuen main rebasen; `track-06`: Readiness-Probe auf #338-Endpoints
   umstellen, Sub-Ticket 06.1 um „#338 bereits erledigt" ergänzen
5. Kurzer Re-Review der Rebase-Diffs (ADR-0022: Push triggert Re-Read), dann PRs

## 5. Was NICHT angefasst wird

Entscheidungen D1–D23, die DoD (ADR-0036), die Tracks und die Agenten-Besatzung (D21) —
die tragen unverändert. Auch Ticket 07 (ELSTER) ist unberührt.
