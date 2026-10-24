# Review — Ticket 04 (Phase 0.4 Domänenkern), Branch `ticket-04-p0-4-domaenenkern` (HEAD 4046b27, Basis 352d153)

## 1. Verdict

**APPROVE** — Der fachliche Kern ist korrekt gegen die Produkt-ADRs modelliert, die Tests
beweisen die lasttragenden Invarianten, und die bewusst *nicht* gebauten Teile (Katalog neu,
Scan/OCR, LangChain-Wiring, Steuer-Formeln) sind durch den Stand-Sync (ADR-0031/0033, #321 R1)
und ehrliche Ticket-/ADR-Vermerke gedeckt. Alle Befunde sind nicht-blockierend (Low/Nit), keiner
rührt an die Fachlichkeit oder die Datenintegrität. Zwei Punkte verdienen einen kurzen Blick vor
der Promotion der ADR-Entwürfe (F1, F2) — sie sind Verbesserungen, keine Korrektheitsfehler.

## 2. Findings

### F1 (minor) — `loeseKonflikt` vertraut einem caller-seitigen `betrag`, statt ihn aus der gewählten Quelle abzuleiten
`packages/core/src/berechnung.ts:94-96, 105-111`

`KonfliktAufloesung` vom Typ `quelle-waehlen` trägt `quelle` **und** `betrag` getrennt
(`{ quelle, betrag }`), und `loeseKonflikt` übernimmt beide ungeprüft. Es wird nicht
verifiziert, dass `(quelle, betrag)` tatsächlich ein Eintrag von `konflikt.quellen` ist. Ein
Aufrufer kann also eine `quelle: { art: 'beleg', belegId: 'b1' }` mit einem willkürlichen
`betrag: 999` kombinieren und erhält einen Posten, dessen Herkunfts-Chip „Beleg" sagt, dessen
Betrag aber kein Beleg je hatte — genau die Klasse „Zahl ohne Deckung", die ADR-008/-014
verbieten. Der aktuelle Test (berechnung.test.ts:88) übergibt passend, beweist also nur den
korrekten Fall, nicht die Invariante.

**Vorschlag:** die Auflösung referenzieren lassen statt duplizieren — z. B.
`{ art: 'quelle-waehlen', quelleIndex: number }` und `betrag`/`quelle` aus
`konflikt.quellen[quelleIndex]` ableiten; oder defensiv werfen, wenn kein
`konflikt.quellen`-Eintrag `quelle`-und-`betrag`-übereinstimmt. Damit wird „eine Quelle wählen
hält deren Betrag UND Herkunft" unrepresentable-to-violate (ADR-0021/0031-Geist).

### F2 (minor) — `Posten.betrag`-Kommentar „Whole euros" wird nicht validiert
`packages/core/src/berechnung.ts:21` vs. `:72-77`

Der Doc-Kommentar behauptet „Whole euros, >= 0"; `validate` prüft nur `Number.isFinite` und
`>= 0`, nicht `Number.isInteger`. `offenePosten` wird korrekt als Integer validiert, der
Posten-Betrag nicht. Folge: `berechne` summiert kommentarlos 1407,5 €. Entweder Integer-Check
nachziehen (konsequent, da Euro-Cent nie modelliert werden sollen) oder den Kommentar ehrlich
auf „non-negative finite" kürzen.

### F3 (nit) — ADR-015/048 „Erstattungs-Spanne" wird nicht modelliert, ADR-0038 zitiert ADR-015 aber als „Implements"
`packages/core/src/berechnung.ts:58-66`, `.scratch/roadmap-1.0/adr-drafts/0038-berechnungs-kern-ki-port.md:6-8`

`Berechnungsstand` liefert `bestimmt` (Punktwert) oder `offen` (Teilsumme + benannte Blocker) —
keine **Spanne** („620–740 €"). Das ist fachlich ehrlich (ohne Tarif-/Formeln gibt es keine
sinnvolle Spanne), und die Formeln sind im Ticket als „bewusst nicht gebaut" geführt. Aber
ADR-0038 listet ADR-015 unter „Implements" und reduziert es auf dessen Negativ-Aussage („kein
Punktwert solange offen"). **Vorschlag:** in ADR-0038 eine Zeile ergänzen, dass die *Spanne*
selbst ein späterer Slice ist (nur die „kein Punktwert bei Offenheit"-Hälfte ist hier umgesetzt)
— sonst steht die Spanne als erfüllt da, obwohl sie es nicht ist.

### F4 (nit) — Beleg-Daten fehlen im DSGVO-Export (folgt dem bestehenden Muster, kein neuer Bruch)
`apps/api/src/account/account-export.service.ts:68` (`taxData: []`)

Der neue persistente, sensible Datenbestand (`Beleg`, inkl. verschlüsseltem `dateiname`) wird im
Art.-15/20-Export nicht ausgeliefert — `taxData` ist hart `[]`, auch die bereits bestehenden
InterviewAnswer/Cockpit-Daten sind nicht exportiert. Das ist ein **vorbestehender** REQ-011-Gap,
den Ticket 04 weder einführt noch verschlimmert; die Beleg-Audit-Zeilen (resource `beleg`)
erscheinen dagegen automatisch im `accessLog`. **Vorschlag:** im ADR-0040-„Security posture"-Absatz
eine Folge-Ticket-Notiz „Beleg-Daten in Export/`taxData` aufnehmen" ergänzen, damit der neue
Bestand nicht stillschweigend an der bestehenden Export-Lücke vorbeiläuft.

### F5 (nit) — `findByIdForUser` definiert, aber nie konsumiert
`apps/api/src/beleg/beleg.repository.ts:33` (+ Prisma-Impl `:52`, Fake `:19`)

Die Seam führt `findByIdForUser`; der Service nutzt nur `findAllForUser`/`create`/`setSteuerjahr`.
Tote Methode im Interface. Entweder der Service soll sie später nutzen (dann kurz dokumentieren,
wofür) oder streichen — sonst wächst die Seam über den tatsächlichen Bedarf hinaus (ADR-0036:
kein Eigenbau/kein Vorrat).

### F6 (nit) — Ticket nennt 6 Rot-Tests, Prüfauftrag/Kontext 7
`.scratch/roadmap-1.0/issues/04-p0-4-domaenenkern.md:64-66`

Die Aufzählung ergibt 3 (PDF) + 2 (REQ-011-Export) + 1 (REQ-014-Rate-Limit) = **6**; der
Review-Kontext spricht von „7 vorbestehenden Rot-Tests". Rein kosmetisch; die Rot-Tests sind
unabhängig von diesem Branch (Chromium/`EADDRNOTAVAIL`) und ohnehin als „nicht re-verifiziert"
geführt (Abschnitt 4).

## 3. Bestätigt (positiv) — Fachlichkeit gegen die Produkt-ADRs geprüft

- **Einkunftsarten (ADR-010/028/030/032/033/034):** `einkunftsarten.ts` bildet das ADR-010-Set
  korrekt ab (`Nichtselbstständig`, `Gewerbe`, `Vermietung`, `Kapital`, `Rente`, `Grenzgänger`).
  Gate-Semantik stimmt: `Gewerbe` ist bei `Selbstständig` **und** `Beides` deklariert und stets
  gegated (ADR-028 „EÜR bleibt draußen"), `Kapital` nur bei `Krypto` (ADR-032), `Vermietung` nur
  bei „Verkauf oder möbliert" (ADR-033); `Rente` als Einkunftsart, nicht als Branch (ADR-034);
  `In ein anderes Land` → keine Einkunftsart (CH-only-Gate, ehrlich, ADR-029). Kombinierbarkeit
  ist als Identitäts-Assertion getestet (nicht nur Set-Größe) — Grenzgänger+Kapital+Vermietung
  und Rente+Vermietung+Kapital.
- **Steuerjahr-Besitz (ADR-006):** `kopple` verweigert same-userId/verschiedenes Jahr/bereits
  gekoppelt; `entkopple` löst nur die Kopplung. **Daten-Erhalt per Test bewiesen**
  (`steuerjahr.test.ts:22,56-57`: `toEqual({ ...a, veranlagung: … })` bzw. `einkunftsarten`
  unverändert).
- **Zustandsmaschine (ADR-018):** exakt die 5 Happy-Path- + 2 Rand-Zustände, keine mehr.
  `rueckfrage`/`extern-erledigt` sind echte Zustände mit echten Transitionen; technischer Fehler
  und Frist sind per **Abwesenheit** aus der Tabelle erzwungen (kein `failed`/`verspätet`-Id
  existiert) — das ADR-0031-§4-Muster „unrepresentable to violate". Die exakte Kantenmenge
  (`pruefung→entwurf`, `extern-erledigt` nur aus entwurf/pruefung) ist ehrlich als Interpretation
  markiert (ADR-0039 + Ticket).
- **Berechnungs-Kern:** deterministisch, `bestimmt` nur wenn nichts offen/konflikt/gegated;
  `offen` benennt exakt, was blockiert, und die `summe` ist nur die settled-Posten-Teilsumme
  („Teilwahrheit als Teilwahrheit"). `PostenKonflikt` (ADR-008) ist ein **eigener Typ**, zählt
  nicht in die Summe, blockiert; `loeseKonflikt` ist der einzige Rückweg. Kein Schätz-Hokuspokus.
- **KI-Port (ADR-014/048):** `KiVorschlag` ≠ `Posten`; nur `nehmeVorschlagAn` macht daraus einen
  Posten mit Herkunft `ki-vorschlag` (+`belegId`). Die Nicht-Mutation ist **strukturell** bewiesen,
  nicht per Laufzeit-Test: kein Core-Modul importiert `KiPort` als Wert, keine deterministische
  Funktion nimmt einen `KiPort`-Parameter — der Kern ist ohne KI-Injektion voll testbar
  (ADR-048 §1). Das ist für eine „unrepresentable"-Grenze die richtige Beweisform (ADR-0021).
  Methodennamen `schlageVorAusBeleg`/`erklaereQuelle` decken sich mit ADR-048 §3.
- **Beleg-Posteingang (ADR-007/008):** ungebundener Upload, Vorschlagsregel § 11 Zufluss
  (Zahlungsdatum vor Belegdatum, cross-year-Fall getestet), Zuordnung als Tap, Konflikt abgeleitet
  statt gespeichert — beide Jahre sichtbar, nichts wird still überschrieben. Der
  Integrationstest (`beleg.integration.test.ts`) deckt **ciphertext-at-rest** (raw-SQL-Check auf
  `^v\d+\.aesgcm256\.`), **Cross-User-Isolation** (fremde Id → 404, kein Leak), **Konflikt** und
  **Audit** (2 WRITE + 1 READ) ab — 7 `it`-Blöcke, deckt sich mit „7/7".
- **`dateiname`-nur-Verschlüsselung ist begründet** (Schema-Kommentar + ADR-0040): Dateinamen
  tragen PII und sind über `userId` an Profile/Steuer-ID joinbar; Datumsfelder bleiben klar, weil
  Vorschlagsregel + `(userId, steuerjahr)`-Index sie ohne Entschlüsselung brauchen und ein Datum
  allein kein Steuer-Identifikator ist. `prisma-encrypted-fields.test.ts` (#325) pinnt die
  verschlüsselte Spaltenmenge gegen Drift — `Beleg.dateiname` ist dort als erwarteter Eintrag
  ergänzt.
- **Segment-2-Bezug:** die neue Zustandsmaschine (`steuerjahr-status.ts`) ist ein **eigenes**
  Lebenszyklus-Modul und fasst `interview.ts` (`ENTRIES`/`entryForStep`, #321 R1) **nicht an** —
  der Katalog wurde korrekt nicht neu gebaut (Stand-Sync `docs/roadmap-1.0.md:157-160` bestätigt
  den Umscope). Kein Widerspruch zu #321 R1; die beiden Graphen (Fragenkatalog vs.
  Steuerjahr-Lebenszyklus) sind disjunkte Belange.
- **Migration:** `20261024080000_add_beleg` ist expand-only (CREATE TABLE + 2 Indizes, kein
  ALTER/DROP/RENAME), benennt keine auth-Modelle um, kollidiert nicht mit t05 (dessen Migrationen
  liegen nicht in diesem Branch).
- **ADR-Entwürfe 0037–0040:** Nummerierung kollisionsfrei (engineering-Log endet bei 0036);
  Status „Draft — promotion needs Musti review"; alle vier tragen ehrlich markierte
  „Open for promotion review"-Punkte (Gewerbe-vs-Selbstständig, Quelle-Vokabular/`loeseKonflikt`-
  Provenienz, Transitionstabelle, Jahr-Konflikt als Produktfrage).
- **Commit-Konvention:** drei Commits im Conventional-Format, `Co-authored-by: Robin`, kein
  Tool-/KI-Footer.

## 4. Nicht re-verifiziert (Gates)

- **Test-/Lint-/Typecheck-Läufe nicht neu ausgeführt** (wie beauftragt). Plausibilität der
  Agent-Angabe nur strukturell geprüft: `packages/core/src` zählt für die sechs neuen Module
  passende `it.each`/`it`-Blöcke mit erkennbar voller Branch-Abdeckung; `beleg.integration.test.ts`
  hat exakt 7 `it`-Blöcke (= „7/7"). Der **Grün-Status** und die **100 % Coverage** sind damit
  nicht belegt → „nicht re-verifiziert".
- **`pnpm -r typecheck` / `lint` / `adr-check` / `register-check` / `openapi.json`-Konsistenz**
  nicht neu ausgeführt; der 209-Zeilen-`openapi.json`-Diff wurde als generiert angenommen, nicht
  gegen die Controller-Dekorate nachgeprüft.
- **Rot-Test-Bestand (Chromium/`EADDRNOTAVAIL`)** nicht neu ausgeführt; als vorbestehend und
  branch-fremd eingestuft, Zählung 6 vs. 7 (F6) offen.
