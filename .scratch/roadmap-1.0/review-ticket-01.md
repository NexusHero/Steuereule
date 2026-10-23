# Review-Report — Ticket 01 (Phase 0.1 Hygiene)

**Reviewer:** Musti (Lead, Review-Rolle) · **Autor des Branches:** Salih
**Datum:** 2026-10-23 · **Scope:** `ticket-01-p0-1-hygiene`, Commit `a24902c` (Diff `ae25d19..HEAD`, 4 Dateien)

Alle Fundstellen sind belegt (`Datei:Zeile`). Nicht selbst nachgelaufene Gates sind als
„nicht re-verifiziert" markiert. Der Branch wurde **nicht** verändert (reiner Review).

---

## 1. Gesamturteil

**APPROVE.**

Der Branch erfüllt die Acceptance-Kriterien von Ticket 01 substantiell vollständig und
nachweislich:

- `package-lock.json` ist **nicht getrackt** (`git ls-files` liefert nur `pnpm-lock.yaml` +
  `skills-lock.json`) und **ignoriert** (`git check-ignore package-lock.json` → `.gitignore:5`).
  `pnpm-lock.yaml` ist das einzige Paketmanager-Lockfile; CI nutzt in **jedem** Job pnpm
  (`pnpm/action-setup@v4`, `pnpm install --frozen-lockfile`, `cache: pnpm`, Node 24).
- Das PR-Template bildet die DoD-1-Checkliste aus ADR-0029 **vollständig und abhakbar** ab
  (TDD, typecheck/oxlint, Draft-PR-Review, Acceptance-Tier, kein Eigenbau, why-only, Posture-Zeile,
  ADR-/Register-Pflege) plus D20-Deviations-Abschnitt. Kein Prosa-Wall, keine AI-Attribution.
- Der rote-Test-Blocker ist **ehrlich dokumentiert**: Ticket-AC 3 bleibt offen mit Grund, und der
  Blocker steht in `progress.db` (Entry 86, Kontext „P0 Foundation", Status „blockiert").

Alle gefundenen Punkte sind **Minor/Info**, keiner ist blockierend.

---

## 2. Findings

### M1 (Minor) — „package-lock.json entfernt" ist eine leichte Überzeichnung

- **Datei:** `.scratch/roadmap-1.0/issues/01-p0-1-hygiene.md:12` (und Commit-Body `a24902c`:
  „Drop npm's package-lock.json")
- **Problem:** `package-lock.json` war bereits im Parent-Commit `ae25d19` **nicht getrackt**
  (`git ls-tree ae25d19 --name-only` zeigt nur `pnpm-lock.yaml` + `skills-lock.json`;
  `git cat-file -e ae25d19:package-lock.json` → „does not exist"). Es gab also nie ein `git rm`.
  Der Branch trägt die Datei nur in `.gitignore` ein und löscht die lokale *untracked* Kopie
  (Commit-Body: „remove the untracked junk (package-lock.json, .DS_Store)").
- **Bewertung:** Der AC-Kern ist erfüllt — die Datei ist nicht im Repo, ist ignoriert und kann
  durch `npm install` nicht regeneriert werden. Nur das Wort „entfernt" impliziert einen
  Versionskontroll-Delete, der nie stattfand.
- **Vorschlag:** Ticket-Formulierung präzisieren auf „nicht getrackt **und** in `.gitignore`"
  (statt „entfernt"), damit die Aussage exakt zum belegbaren Zustand passt.

### M2 (Minor) — PR-Template verweist auf „ADR-0029" ohne Entwurf-Markierung

- **Datei:** `.github/pull_request_template.md:5` („ADR-0029"), `:22` („ADR-0029 D20")
- **Problem:** Das referenzierte Dokument liegt noch als **Entwurf** in
  `.scratch/roadmap-1.0/adr-drafts/0029-definition-of-done.md` (Status „Proposed (Draft — Review
  durch Musti steht aus)") und ist **nicht** nach `docs/adr/` promoviert. `docs/process/README.md:116`
  sagt korrekt „draft", das Template dagegen nennt die Nummer ohne Markierung/Link — ein Leser
  sucht „ADR-0029" vergeblich in `docs/adr/`.
- **Bewertung:** Nicht blockierend — Ticket-AC 4 scoped ausdrücklich „aus ADR-0029-**Entwurf**",
  und die Promotion des ADR läuft parallel über Mustis Review.
- **Vorschlag:** Im Template `(ADR-0029)` → `(ADR-0029, Entwurf)` oder Link auf die Draft-Datei
  ergänzen. Spätestens bei Promotion des ADR nach `docs/adr/` wird der Verweis von selbst kanonisch.

### M3 (Minor) — macOS-Block der `.gitignore` ist eine sinnvolle Teilmenge, nicht die kanonische Liste

- **Datei:** `.gitignore:22-28` (`.DS_Store`, `.AppleDouble`, `.LSOverride`, `._*`,
  `.Spotlight-V100`, `.Trashes`)
- **Problem:** Gegenüber der kanonischen macOS-Liste fehlen die Volume-Root-Artefakte
  (`.DocumentRevisions-V100`, `.fseventsd`, `.TemporaryItems`, `Icon`, `Thumbs.db`). Diese landen
  typischerweise nicht in einem Git-Working-Tree; die Kernforderung des AC (`.DS_Store` u. a.) ist
  erfüllt, nichts ist überladen oder falsch.
- **Vorschlag:** Optional bei Gelegenheit die Volume-Root-Zeilen ergänzen, falls strikte Parität
  mit dem Referenz-Template gewünscht ist. Kein Muss.

### M4 (Info) — Terminologie-Drift „Gates" zwischen Ticket-AC und ADR-0029

- **Datei:** `.scratch/roadmap-1.0/issues/01-p0-1-hygiene.md:15` vs.
  `.scratch/roadmap-1.0/adr-drafts/0029-definition-of-done.md:24` vs.
  `.github/pull_request_template.md:10`
- **Problem:** Der Ticket-AC nennt die Gates „`pnpm gate` (typecheck + tests) und `pnpm lint`";
  ADR-0029 DoD 1 definiert sie als „`typecheck` + `oxlint` green" (Tests liegen dort unter TDD).
  Das PR-Template folgt korrekt dem ADR (`pnpm -r typecheck` + `pnpm lint`). Reine
  Formulierungs-Drift, kein inhaltlicher Widerspruch — der AC bleibt ehrlich offen.
- **Vorschlag:** Keine Änderung erforderlich; ggf. AC-Formulierung bei Gelegenheit an ADR-0029
  angleichen.

---

## 3. Nicht re-verifizierte Punkte

- **Gate-Befund (typecheck grün, lint grün, test rot).** Der Befund des Autors („`typecheck` grün
  7/8 Workspaces, `lint` grün, `test` rot in `apps/mobile-web` mit 2 vorbestehenden Suiten") wurde
  **nicht selbst nachgelaufen** — `node_modules` ist im Worktree nicht installiert, ein
  `pnpm install`/`pnpm gate`-Lauf wurde bewusst nicht ausgeführt. **Statisch bestätigt** ist: beide
  Suiten nutzen `vi.spyOn(window.localStorage, 'setItem')`
  (`apps/mobile-web/src/screens/ProfilScreen.test.tsx:217`,
  `apps/mobile-web/src/screens/onboarding/req-012-onboarding-vertical-join.test.tsx:185`),
  die Testumgebung ist `jsdom` (`apps/mobile-web/vitest.config.ts:56`), und im Worktree läuft
  Node `v26.5.0`. **→ Gate-/Test-Befund als „nicht re-verifiziert, Agent-Befund übernommen"
  gekennzeichnet.**
- **„CI läuft auf Node 24 und ist nicht betroffen".** Statisch bestätigt: `ci.yml` setzt
  `node-version: 24` in allen Jobs. Ein realer CI-Lauf wurde nicht geprüft.

---

## 4. Belegte Prüfungen (verifiziert)

| Prüfung | Ergebnis |
|---|---|
| `package-lock.json` getrackt? | Nein (`git ls-files` → nur `pnpm-lock.yaml` + `skills-lock.json`) |
| `package-lock.json` ignoriert? | Ja (`git check-ignore -v` → `.gitignore:5`) |
| Datei physisch vorhanden im Worktree? | Nein |
| `package-lock.json` im Parent `ae25d19` getrackt? | Nein (war nie getrackt) |
| `pnpm-lock.yaml` alleiniges Paketmanager-Lockfile? | Ja (`skills-lock.json` ist Skill-Tooling, kein Paketmanager-Lockfile) |
| CI nutzt pnpm? | Ja (alle Jobs: `pnpm/action-setup@v4`, `pnpm install --frozen-lockfile`, `cache: pnpm`) |
| Reste von `package-lock` in CI/Scripts? | Keine (Treffer nur in generischen Skill-Docs, `docs/roadmap-1.0.md`-Beschreibung, `adr-review-findings.md` — alle legitim) |
| PR-Template vollständig ggü. ADR-0029 DoD 1? | Ja (alle 6 DoD-1-Punkte + D20-Deviations-Abschnitt, abhakbar) |
| `docs/process/README.md`-Eintrag passt zu Ton/Struktur + Links auflösbar? | Ja (`../roadmap-1.0.md` → `docs/roadmap-1.0.md`, `../../.scratch/…/0029-…` existieren) |
| Neue was-Kommentare? | Keine (`.gitignore`-Eintrag ist why-Kommentar; Sektions-Header sind zulässig) |
| Ticket-Abhakungen ehrlich? | Ja (AC 3 offen mit Grund; AC 1/2/4/5 belegt) |
| Blocker in `progress.db`? | Ja (Entry 86, Repo „Steuereule", Kontext „P0 Foundation", Typ `blocker`, Status `blockiert`) |
| Attribution sauber (kein AI-/„Generated by")? | Ja (Author `NexusHero <suhay.sevinc@gmail.com>`, `Co-authored-by: Salih` = etablierte Repo-Konvention) |
