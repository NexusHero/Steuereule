# Batch-Auftrag: Ticket #443 komplett (Slices 1–7)

Du arbeitest im Repo **SteuerEule** (pnpm-Monorepo, Expo + react-native-web, ausgeliefert **nur als Web-App**).
Du setzt **alle sieben Slices von GitHub-Issue #443** nacheinander um, ohne Rückfragen zwischendurch. Danach prüft ein Reviewer jeden Slice einzeln.

Lies diesen Auftrag **vollständig**, bevor du irgendetwas änderst. Halte dich wörtlich daran. Steht etwas hier nicht, entscheide **nicht** selbst: Schreib es unter „Offene Fragen“ in den Bericht und nimm die im Auftrag genannte Ersatzlösung, oder lass den Punkt weg.

---

## TEIL A — Arbeitsmodus (gilt für den ganzen Batch)

### A1. Reihenfolge und Branches

Die Slices werden **streng nacheinander** umgesetzt. Jeder Slice bekommt einen eigenen Branch, der auf dem vorherigen aufbaut (gestapelt):

| Slice | Branch | Abgezweigt von |
| :--- | :--- | :--- |
| 1 Navigation | `feat/443-s1-navigation` | `origin/main` |
| 2 Hub-Cockpit | `feat/443-s2-hub-cockpit` | `feat/443-s1-navigation` |
| 3 Abgabe-Gate | `feat/443-s3-submission-gate` | `feat/443-s2-hub-cockpit` |
| 4 Sheets | `feat/443-s4-sheets` | `feat/443-s3-submission-gate` |
| 5 Persona-Booster | `feat/443-s5-persona-boosters` | `feat/443-s4-sheets` |
| 6 Dark Mode | `feat/443-s6-dark-mode` | `feat/443-s5-persona-boosters` |
| 7 Tastatur & Haptik | `feat/443-s7-keyboard-haptics` | `feat/443-s6-dark-mode` |

```bash
git fetch origin && git switch -c feat/443-s1-navigation origin/main
```
Für jeden weiteren Slice: `git switch -c <neuer Branch>` direkt vom fertigen vorherigen Branch.

**Nicht pushen. Keine PRs öffnen. Nichts mergen.** Das macht der Reviewer.

### A2. Gate am Ende jedes Slices

Ein Slice ist erst fertig, wenn **alle** diese Befehle grün sind:

```bash
pnpm lint
```
```bash
pnpm -r typecheck
```
```bash
pnpm -r test
```
```bash
node e2e/scenarios/run-all-scenarios.mjs
```
```bash
pnpm --filter @steuereule/e2e no-client-persistence
```
```bash
pnpm --filter @steuereule/e2e breakpoint-layout
```

Die E2E-Befehle starten den Stack selbst. Wenn der Stack lokal **gar nicht** startet (Docker/Postgres fehlt), schreib die genaue Fehlermeldung einmal in den Bericht und arbeite weiter, solange Lint, Typecheck und Unit-Tests grün sind. Markiere dann jeden Slice im Bericht mit „E2E nicht lokal verifiziert“.

### A3. Stopp-Regeln (den ganzen Batch anhalten)

Hör **sofort** auf, schreib den Bericht und mach **keinen** weiteren Slice, wenn:
1. ein Gate-Befehl nach **drei** ernsthaften Reparaturversuchen weiter rot ist;
2. du eine Datei in einem verbotenen Bereich (A5) ändern müsstest, für die dieser Auftrag keine Ausnahme nennt;
3. ein bestehender Test nur grün wird, wenn du seine Erwartung fachlich änderst (z. B. ein anderer Euro-Betrag), ohne dass dieser Auftrag die Änderung ausdrücklich verlangt;
4. du für eine Steuerregel einen Wert bräuchtest, der hier nicht steht.

Ein angehaltener Batch ist ein **gutes** Ergebnis, wenn der Bericht genau sagt, wo und warum.

### A4. Commits

- Kleine Commits, mindestens einer pro Arbeitsschritt, Format `feat(<bereich>): …`, `test(<bereich>): …`, `refactor(<bereich>): …`. Auf Englisch.
- Kein Commit mit rotem Typecheck oder roten Unit-Tests.
- Neue Tests **zuerst** schreiben und rot sehen, dann implementieren. Steht die Implementierung schon: den Fehler kurz absichtlich einbauen, Test rot sehen, wieder rausnehmen.

### A5. Harte Regeln (alle Slices)

- **Nur Web wird geprüft.** Native Varianten nur hinter `Platform.OS !== 'web'`, sie dürfen nichts blockieren.
- **`packages/core`, `apps/api`, DTOs, Prisma-Schema, ELSTER-Druckschablonen** nicht ändern. Ausnahmen stehen ausdrücklich bei Slice 2 und Slice 5.
- **Kein bestehendes `testID` / `data-testid`** umbenennen oder entfernen. Neue `testID`s auf Deutsch mit Bindestrich, im Stil der vorhandenen (`cockpit-weiter`).
- **Keine bestehenden Tests löschen, abschwächen oder `.skip`pen.** Ein Test darf nur angepasst werden, wenn er die alte Klickfolge oder interne Struktur prüft, nicht das fachliche Ergebnis. Jede Anpassung im Bericht begründen.
- **E2E-Szenarien:** Wird ein Szenario rot, zuerst prüfen, ob die App falsch ist (dann App fixen). Nur wenn das Szenario die alte Klickfolge erwartet, das Szenario anpassen. **Die erwarteten Euro-Beträge, PDF-Inhalte und Formularwerte in den Szenarien dürfen sich in Slices 1–4, 6, 7 nicht ändern.**
- **Keine personenbezogenen Daten in URLs** (keine Namen, Steuer-IDs, Beträge).
- **Keine Steuerdaten in localStorage/sessionStorage.** Erlaubt sind nur die hier genannten Keys: `steuereule.returnTo` (sessionStorage), `steuereule.appearance` und `steuereule.haptics` (localStorage).
- **Bezeichner, Dateinamen, Kommentare, Commit-Messages auf Englisch.** Sichtbare UI-Texte auf Deutsch, immer über i18n (`apps/mobile-web/src/i18n/resources.ts`, Namespace `APP_NS`). Keine hart codierten deutschen Strings in Komponenten.
- **Farben nur über `useTheme()`** (`t.color.*`, `t.shadow.*`). Keine Hex-Werte in Komponenten.
- **Keine neuen Abhängigkeiten** außer `@react-navigation/bottom-tabs` (Slice 1) und `expo-haptics` (Slice 7).
- **Keine Datei über ~300 Zeilen** neu entstehen lassen. Lieber aufteilen.

### A6. Bericht

Schreib den Bericht fortlaufend in `docs/agent-prompts/443-batch-report.md` (pro Slice ein Abschnitt, gleich nach dem Slice) und committe ihn mit dem letzten Commit des Slices. Gliederung pro Slice:

1. **Status:** fertig / angehalten (mit Stopp-Regel-Nummer).
2. **Branch und letzter Commit-Hash.**
3. **Geänderte und neue Dateien:** je ein Satz.
4. **Abweichungen vom Auftrag:** jede mit Begründung, sonst „keine“.
5. **Angepasste bestehende Tests/Szenarien:** welche, warum.
6. **Ergebnis jedes Gate-Befehls (A2):** grün/rot, bei rot die Ausgabe.
7. **Offene Fragen.**

---

## TEIL B — Pflichtlektüre vor Slice 1

1. `gh issue view 443` komplett (Kontext, 22 Entscheidungen, Slices, AC 1–12).
2. `docs/agent-prompts/443-slice-1-navigation.md` komplett: Das ist der **ausführliche Teil für Slice 1**.
3. `apps/mobile-web/App.tsx`, `apps/mobile-web/App.test.tsx`.
4. `apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx`.
5. `apps/mobile-web/src/screens/catalog/CatalogScreen.tsx`.
6. `apps/mobile-web/src/screens/plausibility/PlausibilityScreen.tsx` und `packages/core/src/interview/plausibility.ts`.
7. `packages/core/src/interview/interview.ts` (Typen `EntryStepId`, `Answers`, Werte-Konstanten).
8. `e2e/scenarios/helpers/scenario-harness.mjs` und `e2e/scenarios/01-lena-hoffmann-angestellt.mjs`.

---

## TEIL C — Die Slices

### SLICE 1 — Navigation (Tab-Stacks & URL pro Maske)

Führe **Abschnitte 1–7** aus `docs/agent-prompts/443-slice-1-navigation.md` aus. Dessen Abschnitte 8 (Commits) und 9 (Bericht) werden durch Teil A ersetzt; der Branch heißt `feat/443-s1-navigation`.

Danach gibt es: `apps/mobile-web/src/navigation/` mit `routes.ts`, `linking.ts`, `ShellState.tsx`, `CockpitStack.tsx`, `ProfileStack.tsx`, `AppTabs.tsx`, `RequiresAccount.tsx`. Alle folgenden Slices bauen darauf auf.

---

### SLICE 2 — Hub-Cockpit

**Ziel:** Kein Tunnel mehr. Nach dem Primärbeleg und nach jeder Maske geht es zurück ins Cockpit. Das Cockpit zeigt Kacheln mit Status und einen hervorgehobenen „Nächster Schritt“.

**2.1 Tunnel auflösen** (in `CockpitStack.tsx`):

| Maske | `onDone` heute | `onDone` neu |
| :--- | :--- | :--- |
| `Lstb` | Catalog `lebenslagen` | `CockpitHome` |
| `CrossBorder` | Catalog `einkuenfte` | `CockpitHome` |
| `Pension` | `CockpitHome` | unverändert |
| `Catalog` (alle `entry`) | nächster Katalog / `Workdays` | `CockpitHome` |
| `Workdays` | `Plausibility` bzw. `CockpitHome` | `CockpitHome` |
| `Plausibility`, `FilingTypeComparison` | wie heute | unverändert (Slice 3 baut sie um) |

Alle `onBack` der Masken führen zu `CockpitHome`. Ausnahmen: `Partner` → `CockpitMasterData` (wie heute) und `FilingTypeComparison` → `Plausibility` (wie heute). `revisit` beim Katalog ist immer `true`, wenn der Katalog über eine Kachel geöffnet wird und für diesen `entry` schon Antworten existieren; sonst `false`.

**2.2 Kacheln.** Neue Datei `apps/mobile-web/src/screens/cockpit/tiles.ts` mit **einer** Liste aller Kacheln (rein, ohne React), und `CockpitTiles.tsx` zum Rendern. In Slice 2 sind **alle** Kacheln sichtbar, außer wo die Spalte „Sichtbar wenn“ etwas sagt (Persona-Filter kommt in Slice 5).

| Kachel-ID | Route | Sichtbar wenn | Status „erledigt“, wenn |
| :--- | :--- | :--- | :--- |
| `lstb` | `Lstb` | Pfad `angestellte` | LStB-Status aus `wageTaxCertificateStatus` (core) ist vollständig |
| `ch` | `CrossBorder` | Pfad `ch` | `foldStatus?.kind === 'bestimmt' && exchangeRate !== null` |
| `rente` | `Pension` | Pfad `rente` | `status.kind === 'bestimmt'` |
| `lebenslagen` | `Catalog` `lebenslagen` | immer | `nextStepFor(ENTRIES.lebenslagen, answers).kind === 'done'` |
| `einkuenfte` | `Catalog` `einkuenfte` | immer | wie oben mit `einkuenfte` |
| `sonderausgaben` | `Catalog` `sonderausgaben` | immer | wie oben mit `sonderausgaben` |
| `arbeitsweg` | `Workdays` | Pfad ≠ `rente` | Arbeitsweg-Query liefert erfasste Arbeitstage |
| `kapital` | `Capital` | immer | `status.kind === 'bestimmt'` (halb ausgefüllt = offen) |
| `vermietung` | `Rental` | immer | `status.kind === 'bestimmt'` (halb ausgefüllt = offen) |
| `kinder` | `Children` | Interview-Antwort `kinder` ≠ `Nein` | Kinder-Query liefert mindestens ein Kind |

- Die „Query“ ist jeweils der Hook, den die zugehörige Screen-Komponente heute schon benutzt (in deren Datei nachsehen). Lässt sich „erledigt“ aus der Antwort nicht eindeutig ablesen: Kachel zeigt **keinen** Status, und du schreibst es unter „Offene Fragen“.
- Der Pfad kommt aus `pathFromAnswers(interview.answers)` wie heute in `CockpitScreen`.
- Status-Anzeige: `offen` / `erledigt` / `⏳ Betrag offen` (siehe 2.4). Texte über i18n (`cockpit.kachel.status.offen` = „Offen“, `…erledigt` = „Erledigt“, `…betragOffen` = „⏳ Betrag offen“; Titel `cockpit.kachel.<id>.titel`, deutsch, kurz).
- testIDs: Kachel `cockpit-kachel-<id>`, Status `cockpit-kachel-<id>-status`.
- Die vorhandenen Buttons `cockpit-kapital`, `cockpit-vermietung`, `cockpit-kinder` **bleiben** (testIDs nicht entfernen); sie dürfen optisch zur Kachel werden, solange der testID am klickbaren Element bleibt. Dasselbe gilt für `cockpit-bescheid`, `cockpit-stammdaten`, `cockpit-ausdruck`.
- Stil: vorhandene `Card`-Komponente aus `@steuereule/ui`, 2px-Konturen und harte Schatten wie die übrigen Karten. Kein neuer Stil.

**2.3 „Nächster Schritt“.** Der vorhandene Button `cockpit-weiter` wird zum „Nächster Schritt“-Button (testID bleibt `cockpit-weiter`). Er öffnet die **erste nicht erledigte sichtbare** Kachel in dieser Reihenfolge:

- Pfad `angestellte`: `lstb` → `lebenslagen` → `einkuenfte` → `sonderausgaben` → `arbeitsweg`
- Pfad `ch`: `ch` → `einkuenfte` → `sonderausgaben` → `arbeitsweg`
- Pfad `rente`: `rente` → `einkuenfte` → `sonderausgaben` *(vom Product Owner bestätigt)*

Sind alle erledigt, zeigt der Button auf „Abgabe vorbereiten“ (ab Slice 3; in Slice 2 verschwindet er dann). Label über i18n: `cockpit.naechsterSchritt` = „Nächster Schritt: {{titel}}“. Für Gäste und solange das Interview nicht fertig ist, bleibt das heutige Verhalten von `cockpit-weiter` / `cockpit-interview` unverändert.

**2.4 „Betrag später eintragen“ (AC 5). Erlaubte Ausnahme: `packages/core`, `apps/api/src/tax-estimate`, und in `apps/api/src/advisor/advisor.service.ts`, `apps/api/src/owl-mode/owl-mode.service.ts`, `apps/api/src/printout/printout.service.ts` nur der Austausch des Betrags-Parsens.** *(Korrigiert nach PR #449: Die Steuerschätzung hat keinen `openItems`-Mechanismus; `UNCERTAINTY_PER_ITEM`/`cockpit-range.ts` gehören zur Einkommensspanne.)*
- In `packages/core/src/interview/interview.ts`: Konstante `export const AMOUNT_LATER = 'spaeter'`, Allowlist `export const LATER_ALLOWED_STEPS = ['dhf-miete', 'umzug-kosten', 'spenden-betrag', 'kv-pv-betrag', 'pv-betrag', 'kv-wahl-betrag', 'riester-betrag'] as const` und Funktion `laterAmountSteps(answers: Answers): readonly EntryStepId[]` (alle Schritte, deren Antwort `AMOUNT_LATER` ist). Export über den vorhandenen Index.
- `isValidAnswer` akzeptiert `AMOUNT_LATER` **nur** für Schritte aus `LATER_ALLOWED_STEPS`. Für alle anderen Integer-Schritte (`weg`, `tage`, `ch-nichtrueckkehrtage`, `abfindung-betrag`, `lohnersatz-betrag`, `nebenjob-brutto`, `riester-einnahmen-vorjahr`) bleibt es ungültig.
- Neue Core-Funktion `amountFromAnswer(value: string | undefined): number | null` (`null` für `undefined` und `AMOUNT_LATER`). Ersetze damit das lokale Parsen der Allowlist-Schritte in `parseAmount` (`packages/core/src/domains/health-insurance.ts`), `intFrom` (`packages/core/src/domains/employee.ts`) und in den drei oben genannten API-Dateien. `null` → wie „nicht angegeben“. `integerFrom` in `progression-clause.ts` bleibt unverändert. Pro Stelle ein Test, dass `'spaeter'` nicht zu `NaN` wird.
- `packages/core/src/interview/plausibility.ts`: neue **Notice** (keine Conflict) `{ kind: 'betrag-spaeter', steps }`, wenn `laterAmountSteps` nicht leer ist. Dafür `PlausibilityInput` um die Katalog-Antworten erweitern, falls sie dort fehlen.
- Spanne: reine Funktion `widenForLaterAmounts(result: Range, count: number): Range` in `packages/core/src/interview/cockpit.ts`: `to + count × UNCERTAINTY_PER_ITEM`, `from` unverändert; `count < 0` → `RangeError`. `apps/api/src/tax-estimate/tax-estimate.service.ts` ruft sie nur bei `kind === 'spanne'` auf, mit der Summe der `AMOUNT_LATER`-Antworten des Jahres (bei Ehepaaren beider Personen). Nur `result` wird verbreitert; `taxableIncome`, `incomeTax` usw. bleiben. Die Core-Schätzfunktionen bleiben unverändert. `apps/api/src/cockpit` wird nicht angefasst.
- `TaxEstimateDto` bekommt `laterAmounts?: number` (nur gesetzt, wenn > 0). Danach `pnpm --filter @steuereule/api openapi:spec` und `pnpm --filter @steuereule/api-client generate`, generierte Dateien mit committen.
- `CatalogScreen.tsx`, Komponente `IntegerFollowUp`: zweiter Button unter „Weiter“, **nur für Schritte aus `LATER_ALLOWED_STEPS`**, Variante `leise`, Text i18n `katalog.amountLater` = „Betrag später eintragen“, testID `katalog-later-<step>`. Er beantwortet den Schritt mit `AMOUNT_LATER`. Der Katalog läuft danach weiter wie nach einer normalen Antwort.
- Kachel-Status `⏳ Betrag offen`: wenn eine Antwort im Katalog-`entry` der Kachel `AMOUNT_LATER` ist (hat Vorrang vor „erledigt“).
- Wenn der Nutzer den Betrag später nachträgt (Katalog mit `revisit` öffnen, Zahl eingeben), ersetzt die Zahl `AMOUNT_LATER`.

**2.5 Tests (Unit, `apps/mobile-web`):** Tunnel-Kanten aus 2.1; Reihenfolge von `cockpit-weiter` je Pfad; Statuslogik je Kachel (reine Funktionen in `tiles.ts`); `katalog-later-<step>` speichert `spaeter`; Kachel zeigt `⏳ Betrag offen`. **Core:** `laterAmountSteps`, Notice `betrag-spaeter`, `AMOUNT_LATER` als 0 €. `widenForLaterAmounts` mit `count` 0, 1, 3 und negativ; `isValidAnswer` mit `spaeter` für erlaubte und verbotene Schritte. **API:** Service-Test, dass eine `spaeter`-Antwort `result.to` um genau `UNCERTAINTY_PER_ITEM` erhöht und `result.from` gleich bleibt; Ehepaar mit je einer `spaeter`-Antwort → doppelt (Stil der vorhandenen Tests in `apps/api/test/tax-estimate.service.test.ts`).

**2.6 E2E:** Die Szenarien 01–07 und 09–18 laufen heute durch den Tunnel. Ergänze in `e2e/scenarios/helpers/scenario-harness.mjs` zwei Helfer:
- `openTile(page, tileId)` — klickt `cockpit-kachel-<tileId>` und wartet auf die Maske.
- `nextStep(page)` — klickt `cockpit-weiter` und wartet auf die Maske.

Stell die Szenarien so um, dass sie nach jeder Maske über `nextStep(page)` (oder `openTile`, wenn das Szenario eine andere Reihenfolge braucht) zur nächsten Maske gehen. **Die eingegebenen Werte und erwarteten Ergebnisse bleiben identisch.** Plausibilität und Veranlagungsvergleich öffnen die Szenarien in Slice 2 über die bestehenden Wege; in Slice 3 werden sie auf das Gate umgestellt. Ergänze in Szenario 06 einen Fall „Betrag später eintragen“ → Kachel zeigt `⏳ Betrag offen` → Betrag nachtragen → Status `Erledigt`.

---

### SLICE 3 — Abgabe-Gate

**Ziel:** Ohne bestandene Plausibilitätsprüfung kein Ausdruck. Warnungen erscheinen schon vorher an den Kacheln.

**3.1 Hook.** Zieh die Berechnung aus `PlausibilityScreen.tsx` in einen Hook `apps/mobile-web/src/screens/plausibility/usePlausibility.ts`: `usePlausibility(taxYear) → { status: 'loading' | 'error' | 'ready', conflicts, notices }`. Er benutzt dieselben Queries und `checkPlausibility` wie heute. `PlausibilityScreen` benutzt danach den Hook (Verhalten unverändert).

**3.2 Zuordnung zu Kacheln.** In `tiles.ts` eine Konstante `FINDING_TILE: Record<Conflict['kind'] | Notice['kind'], TileId | 'abgabe'>`. Ordne jede `kind` aus `plausibility.ts` der Kachel zu, deren Maske das Problem behebt (z. B. `lstb-offen` → `lstb`; `betrag-spaeter` → die Kachel des `entry`, in dem der Schritt liegt). Passt keine Kachel: `'abgabe'`. Jede Zuordnung bekommt einen Unit-Test.

**3.3 Live-Hinweise an den Kacheln.** Hat eine Kachel einen Conflict: rotes Hinweis-Label (Farbe aus dem Theme, die heute für Fehler genutzt wird), Text `cockpit.kachel.hinweis.blocker` = „Muss vor der Abgabe geklärt werden“. Hat sie nur Notices: Label `cockpit.kachel.hinweis.warnung` = „Bitte prüfen“. testID `cockpit-kachel-<id>-hinweis`.

**3.4 Kachel „Abgabe vorbereiten“.** Eigene, breite Kachel unter den anderen, testID `cockpit-abgabe-vorbereiten`, i18n `cockpit.abgabe.titel` = „Abgabe vorbereiten“. Sie öffnet die neue Route `Submission` (`/app/steuerjahr/:year/abgabe`, in `routes.ts`/`linking.ts`/`CockpitStack.tsx` ergänzen, konto-pflichtig über `RequiresAccount`). Der Screen `SubmissionScreen` (neu, `apps/mobile-web/src/screens/submission/`) zeigt nacheinander:
1. **Plausibilität:** Liste der Conflicts und Notices aus `usePlausibility`, jede mit Button zur zugehörigen Kachel-Route. Bei Conflicts ist „Weiter“ gesperrt. Bei nur Notices: Button `gate-warnung-bestaetigen`, Text `abgabe.warnungenBestaetigen` = „Gelesen, trotzdem weiter“.
2. **Veranlagungsvergleich:** nur bei Zusammenveranlagung (gleiche Bedingung, unter der heute `FilingTypeComparisonScreen` sinnvoll ist; in den Stammdaten nachsehen). Optional: Button „Überspringen“ (`abgabe-vergleich-ueberspringen`). Inhalt: der vorhandene `FilingTypeComparisonScreen` eingebettet.
3. **Ausdruck:** Button `abgabe-zum-ausdruck` öffnet den vorhandenen Root-Screen `Printout`.

- Die Bestätigung der Warnungen wird im `ShellState` gemerkt, je Steuerjahr und je Menge der Notice-`kind`s. Kommt eine neue Notice dazu, muss erneut bestätigt werden. Nach Reload ist sie weg (das ist gewollt).
- `cockpit-weiter` zeigt auf „Abgabe vorbereiten“, wenn alle Kacheln der Reihenfolge aus 2.3 erledigt sind.

**3.5 Ausdruck sperren.**
- Der Button `cockpit-ausdruck` öffnet ab jetzt `Submission` statt direkt `Printout` (testID bleibt).
- Der Root-Screen `Printout` (in `App.tsx`, `PrintoutRoute`) prüft beim Öffnen das Gate: Gibt es Conflicts **oder** unbestätigte Notices, ersetze die Route durch `App` → `Cockpit` → `Submission` mit demselben Jahr. Die Rückkehr von Stripe (`payment`-Param) bleibt erlaubt, wenn das Gate bestanden ist.
- Die alte Route `Plausibility` bleibt erreichbar (URL bleibt), damit nichts bricht; das Cockpit verlinkt sie aber nicht mehr direkt.

**3.6 Tests:** Unit: Gate sperrt bei Conflict; Notices brauchen Bestätigung; neue Notice → erneute Bestätigung; Vergleich nur bei Zusammenveranlagung; `/app/steuerjahr/2025/ausdruck` mit Conflict → `Submission`. **E2E:** alle Szenarien, die heute Plausibilität/Vergleich/Ausdruck erreichen (mindestens 01, 04, 14), gehen über `cockpit-abgabe-vorbereiten`. Ergänze in Szenario 08 einen Fall: Direktaufruf `/app/steuerjahr/2025/ausdruck` mit offener LStB → landet auf der Abgabe-Seite.

---

### SLICE 4 — Sheets

**Ziel:** Masken öffnen als Sheet über dem Cockpit. Beim Schließen wird gespeichert.

**4.1 Komponente `Sheet`** in `packages/ui/src/components/Sheet.tsx` (Export im Index von `@steuereule/ui`):
- Props: `onClose: () => void`, `children`, `testID?`.
- Breite < 768 px (`useBreakpoint()` aus `@steuereule/ui` benutzen): Panel über die volle Breite, oben abgerundet (`t.radius.*`), oben ein Grabber (`sheet-grabber`), fährt von unten hoch. Ziehen am Grabber um mehr als 120 px nach unten → `onClose`. Benutze `PanResponder` aus `react-native`.
- Breite ≥ 768 px: zentriertes Panel, max. Breite `WIDE_CONTENT_MAX_WIDTH`, kein Grabber.
- In beiden Fällen: halbtransparenter Hintergrund (Farbe aus dem Theme), Klick darauf → `onClose`; Schließen-Button oben rechts `sheet-schliessen` mit Label i18n (in `packages/ui` per Prop `closeLabel` reinreichen, damit `ui` keine App-i18n braucht); `Escape`-Taste im Web → `onClose`.
- `accessibilityViewIsModal` bzw. `role="dialog"` und `aria-modal` setzen; Fokus beim Öffnen ins Panel.
- Stil: 2px-Kontur und harter Schatten wie `Card`.
- Storybook/Gallery: Eintrag in `packages/ui/src/gallery/Gallery.tsx` ergänzen, wenn dort alle Komponenten gelistet sind.

**4.2 Einsatz.** In `CockpitStack.tsx` werden diese Routen als Sheet dargestellt: `Lstb`, `CrossBorder`, `Pension`, `Catalog`, `Workdays`, `Capital`, `Rental`, `Children`, `Partner`. Umsetzung:
- Diese Routen in eine `Stack.Group` mit `screenOptions={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}`.
- Der Wrapper jeder dieser Routen rendert `<Sheet onClose={close}>` um die Screen-Komponente.
- Prüfe im Browser (Playwright oder `pnpm --filter @steuereule/mobile-web web`), dass das Cockpit hinter dem Sheet sichtbar bleibt. **Falls nicht:** Hintergrund des Sheets deckend machen und das im Bericht als Abweichung nennen. Nicht weiter basteln.
- `renderActiveStackRoute` (`src/navigation/guards.ts`, aus Slice 1) unmountet verdeckte Stack-Routen. Für Sheets anpassen: `CockpitHome` bleibt gemountet, wenn die oberste Route eine dieser Sheet-Routen ist. Mit einem App-Test absichern (Sheet offen → `CockpitScreen` im Baum vorhanden).
- Die TabBar ist ausgeblendet, solange eine dieser Routen aktiv ist (Logik in der `tabBar`-Funktion aus `AppTabs.tsx` ergänzen).
- Die Masken-Komponenten selbst bekommen **keine** Sheet-Hülle. `OwlModeScreen` bettet sie weiter inline ein (nicht ändern).

**4.3 Auto-Save beim Schließen.** Helfer `apps/mobile-web/src/lib/blurActiveInput.ts`:
- Web: `(document.activeElement as HTMLElement | null)?.blur()`.
- Nativ: `Keyboard.dismiss()`.

`close` in den Sheet-Wrappern ruft zuerst `blurActiveInput()`, dann `navigation.navigate('CockpitHome')`. Das löst das vorhandene Speichern beim Verlassen eines Feldes aus. **Kein** Verwerfen-Dialog. Ein gestagter LStB-Scan (`stagedDraft`, #444) wird **nicht** übernommen, weil `LstbScreen` bei einem gestagten Entwurf ohnehin nicht speichert. Das nicht umgehen.

**4.4 Tests:** Unit für `Sheet` (Grabber nur < 768 px, `onClose` bei Escape, Backdrop, Schließen-Button; Ziehen > 120 px). App-Test: Betrag in `lstb-bruttoarbeitslohn` tippen, ohne das Feld zu verlassen `sheet-schliessen` drücken → PUT wurde gesendet (MSW). App-Test: Bei gestagtem Scan-Entwurf → **kein** PUT. **E2E:** Szenario 22 um „Sheet per Schließen-Button und per Escape schließen, Wert ist gespeichert“ ergänzen. `breakpoint-layout` muss bei 375 px und 1280 px grün sein.

---

### SLICE 5 — Persona-Booster & duales Cockpit

**Erlaubte Ausnahme: `packages/core`, `apps/api` (Interview-Katalog und Steuerschätzung), Szenario-Erwartungen nur dort, wo die neuen Abzüge greifen.**

**5.1 Persona ableiten.** Reine Funktion `derivePersonas(answers, masterData) → ReadonlySet<Persona>` in `apps/mobile-web/src/screens/cockpit/personas.ts`. `Persona = 'angestellt' | 'grenzgaenger' | 'rentner' | 'vermieter' | 'verheiratet' | 'alleinerziehend' | 'eltern'`. Regeln (Werte aus `interview.ts`):
- `angestellt`: `job` ∈ {`Angestellt`, `Beides`} und `ausland` ≠ `Ja, in die Schweiz`
- `grenzgaenger`: `ausland` = `Ja, in die Schweiz`
- `rentner`: `job` = `Rente`
- `vermieter`: Antwort auf Schritt `einkuenfte` ∈ {`Vermietung`, `Beides`} (`INCOME_VALUES`)
- `verheiratet`: `familienstand` = `Verheiratet`
- `eltern`: `kinder` ≠ `Nein`
- `alleinerziehend`: `eltern` und `familienstand` ∈ {`Ledig`, `Geschieden oder getrennt`, `Verwitwet`}

Kein neues Gate-Feld, keine neue Frage im Minimal-Gate. Unit-Tests für jede Regel.

**5.2 Sichtbarkeit.** Erweitere `tiles.ts` um eine Spalte „Personas“. Eine Kachel ist im Hauptbereich sichtbar, wenn sie zu einer der abgeleiteten Personas passt. **Alle anderen Kacheln** stehen in einem eingeklappten Bereich „Weitere Themen“ (`cockpit-weitere-themen`, i18n `cockpit.weitereThemen` = „Weitere Themen“). Keine Kachel ist ganz unerreichbar.

| Kachel-ID | Personas (Hauptbereich) | Route |
| :--- | :--- | :--- |
| `lstb` | angestellt | `Lstb` |
| `ch` | grenzgaenger | `CrossBorder` |
| `rente` | rentner | `Pension` |
| `lebenslagen` | angestellt, grenzgaenger | `Catalog` lebenslagen |
| `einkuenfte` | alle | `Catalog` einkuenfte |
| `sonderausgaben` | alle | `Catalog` sonderausgaben |
| `arbeitsweg` | angestellt, grenzgaenger | `Workdays` |
| `kapital` | rentner | `Capital` |
| `vermietung` | vermieter | `Rental` |
| `kinder` | eltern | `Children` |
| `alleinerziehend` (neu) | alleinerziehend | `Catalog` `alleinerziehend` (existiert schon in `CatalogScreen`) |
| `haushalt` (neu) | alle | `Catalog` `haushalt` (neu, 5.4) |
| `gesundheit` (neu) | rentner, eltern, alleinerziehend | `Catalog` `gesundheit` (neu, 5.5) |

Bei `grenzgaenger` lautet die Überschrift über den Kacheln i18n `cockpit.boosterUeberschrift.nachzahlung` = „Nachzahlung senken“, sonst `cockpit.boosterUeberschrift.erstattung` = „Erstattung erhöhen“.

**5.3 Duales Cockpit (ADR-0054).** Bei `verheiratet` **und** Veranlagungsart „zusammen“ (aus den Stammdaten): zwei Abschnitte, i18n `cockpit.bereich.du` = „Du“ und `cockpit.bereich.partner` = „{{name}}“ (Partnername aus der Stammdaten-Query, **nie** in die URL). Der Partner-Abschnitt hat die Kacheln `partner-lstb` und `partner-arbeitsweg` → Route `Partner` mit `area` `lstb` bzw. `arbeitsweg`; vor dem Navigieren `setPartner({ area, name })` im `ShellState`. Der Splittingvorteil erscheint über die **vorhandene** Steuerschätzung (`tax-estimate.service.ts` rechnet Person B schon mit). Keine neue Rechnung. Der Weg über die Stammdaten (`onRecordPartner`) bleibt zusätzlich erhalten.

**5.4 Neuer Katalog `haushalt` (§ 35a EStG).** In `packages/core/src/interview/interview.ts` (Typ `EntryId`, Konstante `ENTRIES` ab ca. Zeile 290; als Vorlage dient der Eintrag `alleinerziehend`) einen neuen Eintrag `haushalt` mit diesen Schritten:
1. `haushalt-gate`: „Hattest du Kosten für Handwerker, Haushaltshilfe oder Dienstleistungen rund um die Wohnung, auch aus der Nebenkostenabrechnung?“ Werte `Ja` / `Nein`. Bei `Nein` → fertig.
2. `haushalt-dienstleistung-betrag`: Arbeitskosten haushaltsnahe Dienstleistungen und Pflege (z. B. Hausmeister, Treppenhausreinigung, Gartenpflege, Winterdienst), in Euro.
3. `haushalt-handwerker-betrag`: Arbeitskosten Handwerkerleistungen (Renovierung, Reparatur, Wartung), in Euro.
4. `haushalt-minijob-betrag`: Aufwendungen für eine geringfügig Beschäftigte im Haushalt, in Euro.

Fragetexte deutsch über i18n (`katalog.questions.<step>`), Hinweis unter Schritt 1: „Nur Arbeits-, Maschinen- und Fahrtkosten zählen, kein Material. Bezahlt per Überweisung, nicht bar.“ Alle Beträge erlauben `Betrag später eintragen`.

**Rechenregel** (in `packages/core/src/domains/household-services.ts`, Parameter in `packages/core/src/math/tax-parameters.ts`, jeweils mit Kommentar `§ 35a EStG`):
- Minijob (§ 35a Abs. 1): 20 % der Aufwendungen, höchstens **510 €**.
- Dienstleistungen und Pflege (§ 35a Abs. 2): 20 %, höchstens **4.000 €**.
- Handwerker (§ 35a Abs. 3): 20 %, höchstens **1.200 €**.
- Die Summe ist eine **Steuerermäßigung**: Sie mindert die tarifliche Einkommensteuer, aber nie unter 0 €. Keine Erstattung darüber hinaus.
- Rechne in Cent, Rundung wie der restliche Core (vorhandene Rundungshelfer benutzen).

**5.5 Neuer Katalog `gesundheit` (§ 33 EStG, Krankheitskosten).** Schritte:
1. `gesundheit-gate`: „Hattest du selbst bezahlte Krankheitskosten (Zuzahlungen, Brille, Zahnersatz, Medikamente auf Rezept)?“ `Ja` / `Nein`.
2. `gesundheit-betrag`: Summe der selbst getragenen Kosten nach Erstattungen der Krankenkasse, in Euro.

**Rechenregel** (`packages/core/src/domains/extraordinary-burdens.ts`, Parameter in `tax-parameters.ts`, Kommentar `§ 33 Abs. 3 EStG, stufenweise nach BFH VI R 75/14`):
- Abziehbar ist nur der Teil über der **zumutbaren Belastung**. Sie wird **stufenweise** auf den Gesamtbetrag der Einkünfte (GdE) berechnet:

| GdE-Teil | bis 15.340 € | 15.341 € bis 51.130 € | über 51.130 € |
| :--- | :--- | :--- | :--- |
| Ledig, keine Kinder | 5 % | 6 % | 7 % |
| Zusammenveranlagt, keine Kinder | 4 % | 5 % | 6 % |
| 1 oder 2 Kinder | 2 % | 3 % | 4 % |
| 3 oder mehr Kinder | 1 % | 1 % | 2 % |

- Pflicht-Testfall: GdE 51.835 €, 2 Kinder → 15.340 × 2 % + 35.790 × 3 % + 705 × 4 % = 306,80 + 1.073,70 + 28,20 = **1.408,70 €** zumutbare Belastung.
- Der abziehbare Betrag mindert das zu versteuernde Einkommen (wie andere Abzüge im Core; den vorhandenen Weg finden und benutzen).
- Woher der GdE kommt: aus der vorhandenen Berechnung im Core. Gibt es keinen GdE-Wert, den du sicher benutzen kannst: **Stopp-Regel 4**.
- Die Kinderzahl kommt aus der Interview-Antwort `kinder`: `1 Kind` → 1–2 Kinder; `2 oder mehr` → **1–2 Kinder** (die Antwort unterscheidet nicht zwischen 2 und 3+; vom Product Owner bestätigt, nicht als offene Frage melden).

**5.6 Durchreichen.** Die API muss die Einträge `haushalt` und `gesundheit` wie die anderen Katalog-Einträge speichern und lesen. Ergänze beide Werte an genau diesen zwei Stellen: `ADMITTED_ENTRY_IDS` in `apps/api/src/interview/interview.service.ts` und das `enum` von `@ApiQuery({ name: 'eintrag' … })` in `apps/api/src/interview/interview.controller.ts`. Danach den API-Client neu erzeugen und die erzeugten Dateien mit committen:
```bash
pnpm --filter @steuereule/api openapi:spec
```
```bash
pnpm --filter @steuereule/api-client generate
```
Generierte Dateien in `packages/api-client/src/generated/` nie von Hand ändern. Die Steuerschätzung (`apps/api/src/tax-estimate/tax-estimate.service.ts` → Core-Schätzfunktionen) bezieht beide Ergebnisse ein. Liste im Bericht jede Schätzfunktion, die du geändert hast. `CatalogScreen` bekommt die beiden neuen `entry`-Werte.

**5.7 Ausdruck.** Prüfe mit `grep -ri "haushaltsnah\|aussergewoehnlich\|außergewöhnlich" apps/api/src/printout`, ob die Druckschablonen die Anlagen „Haushaltsnahe Aufwendungen“ und „Außergewöhnliche Belastungen“ schon können.
- **Wenn nicht:** Lege in `apps/mobile-web/src/config/features.ts` die Konstante `HOUSEHOLD_AND_HEALTH_BOOSTERS = false` an. Solange sie `false` ist, sind die Kacheln `haushalt` und `gesundheit` unsichtbar und die Steuerschätzung ignoriert beide Kataloge (Flag zusätzlich in der API als Konstante). Grund: Nichts auf dem Bildschirm darf etwas versprechen, das der Ausdruck nicht liefert (ADR-0032). Im Bericht als offene Frage „Druckschablonen für § 35a/§ 33“ nennen.
- **Wenn doch:** Flag `true` und die Werte in die vorhandenen Druckfelder schreiben.
- In beiden Fällen sind Rechenlogik und Tests vollständig fertig.

**5.8 Tests:** Core: alle Grenzen aus 5.4 (unter/genau auf/über dem Höchstbetrag je Absatz; Ermäßigung nie unter 0); alle 12 Zellen der Tabelle aus 5.5 plus der Pflicht-Testfall. Mobile: `derivePersonas` je Regel; Sichtbarkeit je Persona; „Weitere Themen“ enthält alle übrigen Kacheln; duales Cockpit nur bei verheiratet + zusammen; Partnername nicht in der URL. **E2E:** Szenario 04 (Weber) über die Partner-Kacheln statt über die Stammdaten; Szenario 05 (Rentner) sieht `kapital` im Hauptbereich und `arbeitsweg` unter „Weitere Themen“; Szenario 07 (alleinerziehend) sieht `alleinerziehend`. Ändern sich dadurch erwartete Beträge, **Stopp-Regel 3**, es sei denn das Flag aus 5.7 ist `true` und das Szenario gibt § 35a/§ 33-Kosten ein.

---

### SLICE 6 — Dark Mode

**6.1 Token-Audit.** Quelle der Farben: `finanzo-funke-design-system/project/tokens/colors.css` (hell) und `dunkel.css` (dunkel). Danach baut `pnpm --filter @steuereule/tokens build` das Paket `@steuereule/tokens`.
- Liste im Bericht jede Farbe aus `colors.css`, die in `dunkel.css` **keinen** eigenen Wert hat, und sag zu jeder: bleibt gleich (Begründung) oder neuer Wert.
- Neue Dunkel-Werte nur aus der vorhandenen Palette ableiten (keine neuen Markenfarben). Die Limette `funke` bleibt Akzent.
- Harte Schatten (`effects.css`): Im Dunkeln dürfen sie nicht schwarz auf fast schwarz sein. Wenn `dunkel.css` keinen Schattenwert hat, setz den Schatten im Dunkeln auf die Konturfarbe (`tinte` dunkel), damit er sichtbar bleibt.
- **Kontrast-Test** in `packages/tokens/src/contrast.test.ts`: Für hell **und** dunkel muss jede Text-auf-Fläche-Kombination, die die App benutzt (mindestens `tinte` und `tinte2` auf `grund`, `karte` und `nacht`, Text auf `funke`), ein Kontrastverhältnis von mindestens **4,5 : 1** haben (WCAG-Formel, im Test implementieren). Schlägt er fehl, Werte in `dunkel.css` anpassen, nicht den Test.

**6.2 Verdrahten.**
- `apps/mobile-web/src/lib/appearance.ts`: `type AppearancePreference = 'system' | 'light' | 'dark'`, lesen/schreiben in **localStorage** Key `steuereule.appearance`, jeder Zugriff in `try/catch`, Standard `system`. Geschrieben wird **nur**, wenn der Nutzer die Einstellung ändert.
- `App.tsx`: `ThemeProvider mode` = Präferenz, bei `system` aus `useColorScheme()` (`react-native`). `StatusBar style` = `light` im Dunkeln, sonst `dark`.
- `packages/ui`: Prüfe jede Komponente auf feste Farben (grep nach `#` und `rgba(`); ersetze sie durch Theme-Tokens.
- `apps/mobile-web/src/icons/AppleG.tsx`: Füllfarbe `#1d1d1f` ist auf dunklem Grund unsichtbar; über eine `color`-Prop aus `t.color.tinte` steuern. `GoogleG.tsx` (Markenfarben) bleibt.

**6.3 Profil.** In `ProfileScreen` ein Abschnitt „Darstellung“ (i18n `profil.darstellung.titel`) mit drei Optionen `System` / `Immer hell` / `Immer dunkel` (vorhandene `Option`- oder `Chip`-Komponente benutzen), testIDs `profil-darstellung-system`, `profil-darstellung-hell`, `profil-darstellung-dunkel`. Wirkt sofort und bleibt nach Reload.

**6.4 Tests:** Unit: Präferenz-Logik (inkl. blockiertem Storage); `ThemeProvider` bekommt `dark` bei System-Dunkel; Profil-Auswahl schreibt den Key. **E2E:** neues Skript `e2e/responsive/dark-mode.mjs` (Stil wie `breakpoint-layout.mjs`, in `e2e/package.json` als `dark-mode` eintragen): `colorScheme: 'dark'` emulieren, Cockpit, eine Maske, Profil öffnen, prüfen, dass der Body-Hintergrund dem dunklen `grund` entspricht; `Immer hell` wählen, neu laden, hell. `no-client-persistence` muss grün bleiben. Wenn es wegen `steuereule.appearance` rot wird, prüfen, ob der Test-Flow die Einstellung ändert; der Key darf nur dann geschrieben werden.

---

### SLICE 7 — Tastatur & Haptik

**7.1 Tastatur.** `Input` aus `@steuereule/ui` setzt bei `type="numeric"` schon `keyboardType="number-pad"`; react-native-web macht daraus `inputmode="numeric"`.
- Prüfe mit einem Unit-Test in `packages/ui`, dass `Input type="numeric"` im Web `inputmode="numeric"` rendert.
- Finde alle Betrags- und Zahlenfelder in `apps/mobile-web/src` (grep nach `<Input` und `TextInput`), die **nicht** `type="numeric"` haben, aber Zahlen erwarten, und stell sie um. Liste sie im Bericht.
- Formulare müssen bei geöffneter Bildschirmtastatur bedienbar bleiben: Masken mit Formularen (die Sheet-Inhalte aus Slice 4) bekommen `KeyboardAvoidingView` (`behavior="padding"` nur auf iOS, sonst ohne).

**7.2 Haptik.**
```bash
pnpm --filter @steuereule/ui exec npx expo install expo-haptics
```
(Falls das im Paket nicht klappt: `expo-haptics` mit der zu Expo SDK 53 passenden Version in `packages/ui/package.json` eintragen; Version im Bericht nennen.)
- `packages/ui/src/lib/haptics.ts`: `hapticSelection()`, `hapticLight()`, `hapticMedium()`, `hapticSuccess()`, `hapticWarning()`. Auf Web **No-Op** (`Platform.OS === 'web'` → sofort zurück, `expo-haptics` gar nicht laden: `await import('expo-haptics')` nur nativ). Aus, wenn `AccessibilityInfo.isReduceMotionEnabled()` true ist oder die Präferenz aus. Fehler immer schlucken.
- Präferenz: `setHapticsEnabled(boolean)` in `haptics.ts`; die App liest/schreibt sie in **localStorage** Key `steuereule.haptics` (`apps/mobile-web/src/lib/hapticsPreference.ts`, `try/catch`, nur beim Ändern schreiben) und reicht sie beim Start an `setHapticsEnabled` weiter.
- Einbau: `Option` antippen → `hapticLight`; `TabBar`-Wechsel und Steuerjahr-Umschalter → `hapticSelection`; `Button variant="primaer"` → `hapticMedium`; Kachel wechselt auf „erledigt“ → `hapticSuccess`; Gate zeigt einen Conflict oder Speichern schlägt fehl → `hapticWarning`.
- Profil: Schalter „Haptisches Feedback“ (`profil-haptik`), **nur auf nativen Plattformen** sichtbar (im Web ausblenden).

**7.3 Tests:** Unit: Haptik ist auf Web No-Op (Mock von `expo-haptics` wird nie aufgerufen); nativ (Platform-Mock) wird bei Primär-Button `impactAsync(Medium)` aufgerufen; bei reduce motion nicht; Präferenz aus → nicht. `inputmode="numeric"`-Test aus 7.1. E2E: keine neuen nötig, alle bestehenden grün.

---

## TEIL D — Abschluss des Batches

Wenn Slice 7 fertig ist (oder der Batch angehalten wurde):
1. Bericht `docs/agent-prompts/443-batch-report.md` um einen Abschnitt **„Gesamt“** ergänzen: Liste der Branches mit letztem Commit-Hash; Liste **aller** offenen Fragen aus allen Slices; welche Gate-Befehle lokal nicht liefen.
2. Bericht committen.
3. Nichts pushen.
