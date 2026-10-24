# Review — ticket-16-p1b-slice2 (09-Slice 2: Vorsorge-Faltung + CH-Screen)

**Verdict: APPROVE**

Review über `git diff 4908ed2...HEAD` (3 Commits, `088b94c` core → `7c1c4b7` api → `a932e53` mobile-web).
Read-only; keine Git-Mutationen.

## Standards

- **Commit-Konventionen:** alle drei Commits folgen `feat(scope): …` mit Body; kein Tool-Footer.
  Sign-off via `Co-authored-by: Robin <robin@steuereule-crew.example>` (korrekt, kein "generated with"-Footer).
- **DoD:** Commit `7c1c4b7` trägt eine "Posture (Security/Privacy)"-Zeile (was der Screen/API tut/nicht tut,
  Beweis auf die Acceptance-Tests). Typecheck/lint-Gates laut Agent grün (nicht re-verifiziert, s.u.).
- **Kein Eigenbau:** die Faltung ist nirgends reimplementiert — `grenzgaengerStand`/`chPostenAlsKernposten`/
  `grenzgaengerStatus`/`amtlicherMonatskurs`/`tatsaechlicherKurs` werden aus `@steuereule/core` importiert
  (service.ts:4-6). Wechselkurs/Pipe werden wiederverwendet (`ParseSteuerjahrPipe` aus cockpit, Import, keine Änderung).
- **Hoheitsgebiete unangetastet:** `apps/api/src/cockpit` und Beleg-Inbox (t15/t10) haben im Diff **null** Änderungen.
  `interview.controller.ts` bekommt nur `'segment-ch'` in der `eintrag`-Enum (Zeile 47), `interview.module.ts` nur einen
  `exports` (geteilte Engine, Minimal-Gate unberührt). Kein Verstoß.

## Fachlichkeit (Fragen 1–6)

1. **Posten.rolle + 3 Buckets — ehrlich, kein stilles Verschieben.** REQ-021 (register.md:32) verlangt die
   **CHF→EUR-Umrechnung mit Herkunft** + amtlich/tatsächlich + "nichts geschätzt" — *nicht* die Subtraktion in eine
   Erstattung. Die Nicht-Aggregation ist im Code begründet (berechnung.ts:21-29: "aggregation of Vorsorgeaufwand against
   income is a later tax-formula slice's work … partial truth stated as a partial truth") und deckt sich mit
   `angestellte.ts`'s Sonderausgaben-Haltung. `zulagenVerrechnen` kann negativ sein (grenzgaenger.ts:201-214) und ist als
   bewusste Saldierung dokumentiert + getestet (grenzgaenger.test.ts:131 `expect(…2000, 2500)).toBe(-500)`). Kein
   `>=0`-Clamping, kein versteckter Fix.

2. **AHV → null — benannt, nicht still.** AHV ist `postenRelevant: false` (grenzgaenger.ts:88), die Begründung
   "DBA treatment is open" steht dreifach (Z. 76-78, Z. 131, Z. 258-260) und im Test
   (`chPostenAlsKernposten(ahv)).toBeNull()`). Register-Zeile 32 listet AHV korrekt *nicht* unter den gefalteten
   Line-Items.

3. **Wechselkurs — amtlich Default / tatsächlich belegpflichtig, ehrlich persistiert.** `tatsaechlicherKurs` wirft auf
   leerer `belegId` (wechselkurs.ts:51); Acceptance belegt 400 ohne Beleg (req-021…test.ts:180-185). Persistierte
   tatsächliche Kurse ohne Beleg werden beim Lesen zu `null` (nicht gefaltet, keine amtliche Rückfalle — service.ts:69-73).
   Kurs ist Eingabe, keine geratene Zahl; BMF-Quelle ist explizit Backend-Aufgabe (wechselkurs.ts:10-11).

4. **REQ-021-Register.** Summary- und Traceability-Zeile beide auf `Done` gehoben, Status-Spalte benennt `Rolle`/`chPostenAlsKernposten`/
   `zulagenVerrechnen`. Tier-Zitate real: `apps/api/test/acceptance/req-021-ch-posten-faltung.test.ts` existiert (250 Z., real
   Postgres + real Socket, GWT + offen + 400 + P3/P4/P5 + Audit), die core-Tests (`berechnung.test.ts`, `grenzgaenger.test.ts`)
   sind im selben Diff erweitert. `register-check` grün laut Agent — **nicht re-verifiziert**.

5. **CH-Screen.** Grenzgänger-Status und Faltung werden **aus der Server-Antwort** gelesen (`lohnausweis.status`/`.stand`,
   GrenzgaengerScreen.tsx:203-204, 238-263); die Rechenfunktionen werden nicht importiert (Zeile 14 importiert nur
   `ENTRIES`/`LOHNAUSWEIS_FELDER`/`formatEuro`/`nextStepFor`) — "nie client-seitig gerechnet" gilt zusätzlich per statischer
   Abwesenheit. Der Test beweist "rendert den Server-Wert" (GrenzgaengerScreen.test.tsx:123-135), nicht direkt "rechnet nicht"
   (nur über die Abwesenheit des Rechenwegs). Lohnausweis-Maske führt Ziffern 1–15 (LOHNAUSWEIS_FELDER, 14 CHF-Beträge +
   Bemerkungen), CHF führt (ADR-036). Routing: `ausland === 'Ja, in die Schweiz'` → `'ch'`, sonst `'main'`
   (App.tsx:261) — exklusiv, nur dieser eine Wert (`AUSLAND_VALUES`, interview.ts:209).

6. **Gates.** core 295 / api 364 / mobile-web 394 laut Agent grün — **nicht re-verifiziert** (keine Neuläufe, read-only).

## Findings (nicht blockierend)

- **F1 (minor)** `apps/api/src/ch-lohnausweis/dto/wechselkurs.dto.ts:31` — `@Min(0)` lässt `kurs === 0` durch die
  DTO-Ebene; der Kern (`amtlicherMonatskurs`/`tatsaechlicherKurs`, wechselkurs.ts:34) lehnt `kurs <= 0` ab und der Service
  übersetzt den `RangeError` korrekt in 400. Funktionell korrekt, aber die DTO-Dokumentation ist lockerer als die Invariante.
  *Vorschlag:* `@IsPositive()` (oder `@Min` mit exklusivem Grenzwert-Kommentar), damit die Boundary und der Kern dasselbe sagen.

- **F2 (minor)** `apps/api/src/ch-lohnausweis/ch-lohnausweis.service.ts:104` — `postenZuDto` setzt `rolle: kern?.rolle ?? 'einnahme'`.
  Für AHV/Familienzulage liefert `chPostenAlsKernposten` `null`; die Fallback-Zuweisung `'einnahme'` wäre irreführend, wäre die
  Zeile erreichbar. Heute nicht erreichbar (kein Produzent für diese `ChPostenArt`s, und `grenzgaengerChPosten` erzeugt sie nie).
  *Vorschlag:* Kommentar zur Unerreichbarkeit ergänzen oder `rolle` für `kern === null` weglassen, statt auf `'einnahme'`
  zurückzufallen.

## Nicht re-verifiziert

- Gates (core/api/mobile-web) — nicht neu ausgeführt; Befund (umfassende, zusammenpassende Tests) ist plausibel.
- `register-check` — nicht ausgeführt; REQ-021-Zeile ist konsistent, aber das Gate selbst lief hier nicht.
- Lauf der Acceptance-Suite gegen reales Postgres (kein Postgres/Docker in dieser Read-only-Session).
