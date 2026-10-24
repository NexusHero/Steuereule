# Review — Ticket 08, Phase 1a Angestellte-Vertikale Slice 1

- **Branch:** `ticket-08-p1a-angestellte` (Worktree `Steuereule-t08`), HEAD `a4b58c2`
- **Basis:** `563e076` (05-Branch, ungemerged)
- **Diff:** `git diff 563e076...HEAD` (44 Dateien, +3021/−47)
- **Reviewer:** Musti (Architekt), read-only

## (1) Votum

**REQUEST-CHANGES**

Der Slice ist fachlich sauber, ehrlich geschnitten, TDD-gedeckt und baut durchgehend auf
bestehenden Seams auf (ParseSteuerjahrPipe, AuditService, ENCRYPTED_PRISMA, die #321-Engine,
Fake-Repository-Muster). Zwei Punkte müssen vor Merge nachgezogen werden: (a) der ADR-0041-Entwurf
ignoriert die t09-Kollision, die im Prüfauftrag explizit benannt ist; (b) `arbeitstage.ts`
behauptet „deterministische Arbeitstage aus dem Kalender", rechnet aber gesetzliche Feiertage
schlicht nicht heraus — ohne Dokumentation dieses Deferrals, was gegen den Ehrlichkeits-Grundsatz
(ADR-0032/032) verstößt. Alles Weitere sind nicht-blockierende Kleinigkeiten.

## (2) Findings

### F1 — ADR-0041-Kollision mit t09 wird ignoriert (blockierend, merge-relevant)
- `scratch/roadmap-1.0/adr-drafts/0041-lstb-angestellte-vertikale.md:1` (Titel) und Commit
  `a4b58c2` (Body: „Nächste freie engineering-Nr nach 0040 geprüft: 0041").
- t09 (`origin/ticket-09-p1b-grenzgaenger-ch`) führt bereits
  `0041-grenzgaenger-ch-vertikale.md`. Der 08-Entwurf erwähnt die Kollision an keiner Stelle;
  die Commit-Behauptung „nächste freie Nr = 0041" wurde offenbar nur gegen den 08-Baum geprüft.
- Vorschlag: Im Entwurf einen Hinweis aufnehmen („0041 ist durch t09 belegt — beim Merge auf
  0041/0042 auflösen"), die Commit-Behauptung korrigieren, und die `adr-check-ignore`-Ausnahme
  explizit begründen statt still zu tragen.

### F2 — `arbeitstage.ts`: gesetzliche Feiertage fehlen, ohne Deferral-Vermerk (blockierend)
- `packages/core/src/arbeitstage.ts:69-77` (`werktageImJahr`) und `:98-121`
  (`berechneArbeitstage`): `werktage` = alle gewählten Wochentage des Jahres;
  `arbeitstage = werktage − urlaub − krank`; `pendlertage = arbeitstage − homeoffice`.
- Kein Term für gesetzliche Feiertage. Die Pendlerpauschale (Entfernungspauschale) zählt
  tatsächlich gefahrene Arbeitstage; ein Feiertag auf einem Arbeitstag reduziert die Pendler-Tage.
  Der Header (`:1-13`) dokumentiert das Deferral des Distanzbandings/der Caps, ist aber zu den
  Feiertagen still — `Arbeitstage`/`Pendlertage` sind daher systematisch zu hoch, ohne dass das
  benannt wird. Der Test `arbeitstage.test.ts:32-35` („2026 hat 261 Wochentage") bestätigt die
  rohe Wochentagszahl, keine Arbeitstage.
- Vorschlag: Entweder Feiertags-Subtraktion (Bundesland-abhängig, also später Slice) ODER — der
  minimal-ehrliche Weg für diesen Slice — im Header einen expliziten Deferral-Vermerk analog zum
  Banding: „gesetzliche Feiertage werden in diesem Slice noch nicht abgezogen (Folge-Slice)". Die
  Benennung `arbeitstage`/`pendlertage` dann ggf. als „vor Feiertagen" kennzeichnen.

### F3 — „ids präfixiert/namespaced" ist überzeichnet (nicht blockierend)
- `packages/core/src/interview.ts:116-122` (Header) und Commit `f8741aa` („ids präfixiert für
  additiven Merge mit t09").
- Die Lebenslagen-/Sonderausgaben-Ids sind NICHT namespace-präfixiert (`dhf`, `umzug`,
  `abfindung`, `spenden`, … sind nackt); nur die Betrags-Follow-ups tragen den Eltern-Namen
  (`dhf-miete`, `umzug-kosten`). Die tatsächliche Kollisionssicherheit gegen t09 kommt aus der
  geschlossenen `EntryStepId`-Union plus `buildStepIndex`-Throw (D3), nicht aus der Benennung.
- Vorschlag: Formulierung präzisieren („follow-ups namensgeprägt; Kollisionsschutz strukturell
  über die geschlossene Union + buildStepIndex"), damit die Behauptung nicht als Namens-Mechanik
  gelesen wird, die es nicht gibt.

### F4 — Feld-Id-Liste existiert an zwei Stellen (nicht blockierend)
- `packages/core/src/lstb.ts:91` (`const FELDER`) und
  `apps/api/src/lstb/parse-lstb-feld.pipe.ts:9` (`const LSTB_FELDER`).
- Die „eine Encoding-Stelle"-Behauptung (Zustand↔String) stimmt — `serialisiere/deserialisiere`
  ist die einzige Abbildung. Aber die drei Feld-Ids sind doppelt deklariert. Die Pipe begründet
  das (core exportiert nur den Typ, keine Runtime-Liste). Bei einem festen 3-Felder-Produktfakt
  geringes Risiko; akzeptabel, aber als Drift-Punkt notiert.

### F5 — Register-Traceability REQ-017 P1 zitiert die falsche Kern-Datei (nicht blockierend)
- `docs/requirements/register.md` (REQ-017-Zeile): zitiert `packages/core/src/interview.test.ts
  (P1, pure graph)`.
- `interview.test.ts` deckt D3/`entryForStep`/Segment-2 ab, aber die Walker-Pfade der NEUEN
  Einträge (Lebenslagen/Sonderausgaben) liegen in `packages/core/src/angestellte.test.ts:96-134`.
- Vorschlag: REQ-017-Artefakt um `angestellte.test.ts` ergänzen bzw. die Zitate präzisieren.

### F6 — MSW-PUT-Handler handgeschrieben trotz „nie handgeschrieben" (nicht blockierend)
- `apps/mobile-web/src/test-msw-server.ts` (der `http.put('*/…/lstb/:feld', …)`-Default) und
  ADR-Entwurf `0041-lstb-angestellte-vertikale.md:78` („MSW-Handler sind generiert (orval), nie
  handgeschrieben").
- Der GET nutzt den generierten `getLstbControllerGetLstbMockHandler`; der PUT-Default ist ein
  roher `http.put`. Das spiegelt das bestehende Interview-POST-Muster (generischer 200-Default)
  und ist funktional unkritisch, widerspricht aber der ADR-Formulierung.

### F7 — Gate-Zahlen des Agent-Befunds leicht inkonsistent (nicht re-verifiziert)
- Agent-Befund „api 355+20". Die neu hinzugekommenen API-Tests sind 11 (req-016) + 9 (req-017) +
  8 (lstb.service) = 28, nicht 20 (die „20" zählen nur die zwei Acceptance-Dateien). Kein
  funktionaler Befund; nur zur Präzisierung.

## (3) Nicht re-verifiziert (Gates nicht neu gelaufen — Anweisung)

- **Gates** wurden nicht neu ausgeführt (erfordern u. a. reales Postgres für die
  Acceptance-Tier). Der Agent-Befund (core 241, api 355+20, mobile-web 389, typecheck/lint/
  register/adr grün) wurde **nur plausibel geprüft, nicht re-verifiziert**: Die Test-Dateien
  existieren, die Test-Anzahlen in den Acceptance-Dateien stimmen (req-016 = 11 `it`, req-017 =
  9 `it`), aber ein Lauf wurde bewusst nicht gemacht. Konkret offen: ob die Acceptance-Tests gegen
  das reale Postgres tatsächlich grün sind und ob typecheck/lint im vollen Workspace grün sind.

## Standards-Prüfung (Kurz)

- Commit-Konventionen: `feat(core|api)`, `docs`, Body deutsch, `Co-authored-by: Kaan` — **kein
  Tool-Footer**. ✓
- Migration `20261024090000_add_lstb`: expand-only (CREATE TABLE + UNIQUE INDEX, keine ALTER an
  Bestand). ✓
- Keine `packages/core`-Umbenennung, keine auth-/t09-Hoheitsgebiets-Verletzung; `interview.ts`
  nur additiv (Back-compat-Tier `QuestionId`/`GateId`/`Step` unverändert). ✓
- Kein neuer Eigenbau: Wiederverwendung von ParseSteuerjahrPipe, AuditService, ENCRYPTED_PRISMA,
  Interview-Engine, Fake-Repository-Muster; WRITE-Audit atomar im Repository / READ-Audit im
  Service entspricht exakt dem Beleg-Muster. ✓
- Feldverschlüsselung + Audit: nachgewiesen durch raw SQL in `req-016-lstb-angestellte.test.ts:189-204`
  (ciphertext `^v\d+\.aesgcm256\.`) und `prisma-encrypted-fields.test.ts` (drei Lstb-Felder
  `encrypt: true, strictDecryption: true`). ✓
