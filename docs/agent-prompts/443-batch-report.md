# Batch-Bericht: Ticket #443 (Slices 1–7)

> Hinweis zur lokalen E2E-Ausführung (gilt für den gesamten Lauf): Port `5432` ist auf diesem Rechner durch einen fremden Dienst belegt. Die E2E-Befehle (`run-all-scenarios.mjs`, `no-client-persistence`, `breakpoint-layout`) wurden daher im `ATTACH`-Modus gegen die lokale Postgres-16-Instanz auf `localhost:5434` (isolierte Datenbank `steuereule_e2e_443`, `libpq` unter `/opt/homebrew/opt/libpq/bin`), die gebaute `@steuereule/api` (`:3301`) und das statisch exportierte Web-Bundle (`:4173`) ausgeführt — gegen echtes Backend, echte Datenbank und echten Chromium-Browser ohne übersprungene Assertions.

---

## Slice 1 — Navigation (Tab-Stacks & URL pro Maske)

### 1. Status
**fertig**

### 2. Branch und letzter Commit-Hash
- Branch: `feat/443-s1-navigation` (abgezweigt von `origin/main` `1990ed3`)
- Letzter Code-/Test-Commit vor diesem Bericht-Commit: `6744999c218f394fc730562fe6e8c5773a2b4508` (`test(e2e): verify deep-link reload and history back in scenario 08`); dieser Bericht wurde direkt im Anschluss auf demselben Branch committet.

### 3. Geänderte und neue Dateien
- `apps/mobile-web/App.tsx`: ersetzt die bisherigen `cockpitView`/`profileView`-States durch `ShellStateProvider`, `CopilotBridgeProvider` und `AppTabs` innerhalb von `RootStack` mit URL-`linking`.
- `apps/mobile-web/App.test.tsx`: ergänzt 11 Tests zu Tab-State-Erhalt (AC 1), Pop-to-Root, Deep-Links (AC 2), `year`-/`Partner`-Guards, Gast-Deep-Link mit `steuereule.returnTo` (AC 3), unverändertem Tunnel sowie `ProfileStack`.
- `apps/mobile-web/package.json`: ergänzt `@react-navigation/bottom-tabs` (`^7.18.14`) passend zur installierten `@react-navigation/native`-7.x-Reihe.
- `pnpm-lock.yaml`: Lockfile-Aktualisierung für `@react-navigation/bottom-tabs@^7.18.14`.
- `apps/mobile-web/src/navigation/routes.ts`: definiert die Typen `CockpitStackParamList`, `ProfileStackParamList`, `AppTabParamList` und `RootStackParamList`.
- `apps/mobile-web/src/navigation/linking.ts`: verlagert und erweitert `LinkingOptions<RootStackParamList>` um alle Cockpit- und Profil-Masken-URLs inkl. `Number`-Parsing für `:year` und `revisit=1`.
- `apps/mobile-web/src/navigation/linking.test.tsx`: prüft URL-Roundtrips aller 28 Routenpfade aus der Routentabelle sowie Parameter-Parsing und Root-Ausnahmen.
- `apps/mobile-web/src/navigation/ShellState.tsx`: stellt `ShellStateProvider` und `useShellState()` für `taxYear`, `funnelPath`, `pendingPath`, `partner`, `focusedTab` und Tab-/Cockpit-Navigation bereit.
- `apps/mobile-web/src/navigation/AppTabs.tsx`: implementiert den `BottomTabNavigator` mit der Funke-`TabBar`, Tab-Einfrieren ohne Reset, Pop-to-Root (inkl. `event.preventDefault()` gegen NativeStack-Doppel-Reset) und Ausblenden der `TabBar` auf `Profile`-Unterseiten.
- `apps/mobile-web/src/navigation/CockpitStack.tsx`: definiert den `NativeStackNavigator` für den Cockpit-Tab inkl. `CockpitHome`, `Interview` und `AccountWall`.
- `apps/mobile-web/src/navigation/CockpitTunnelRoutes.tsx`: kapselt die Tunnelrouten (`Lstb`, `Pension`, `CrossBorder`, `Catalog`, `Workdays`, `Plausibility`, `FilingTypeComparison`) mit unveränderten `onDone`/`onBack`/`revisit`-Kanten unter `RequiresAccount`.
- `apps/mobile-web/src/navigation/CockpitDetailRoutes.tsx`: kapselt die Detailrouten (`Assessment`, `Capital`, `Rental`, `Children`, `CockpitMasterData`, `Partner`) unter `RequiresAccount` inkl. `Partner`-Fallback auf `CockpitMasterData`.
- `apps/mobile-web/src/navigation/ProfileStack.tsx`: definiert den `NativeStackNavigator` für den Profil-Tab (`ProfileHome`, `Privacy`, `Security`, `ProfileMasterData`).
- `apps/mobile-web/src/navigation/RequiresAccount.tsx`: leitet Gäste auf konto-pflichtigen Routen nach Hinterlegen der Ziel-URL in `steuereule.returnTo` auf `AccountWall` um.
- `apps/mobile-web/src/navigation/guards.ts`: stellt `isSelectableYear`, `useYearGuard` sowie `renderActiveStackRoute` zum Unmounten verdeckter Stack-Karten im selben Stack bereit.
- `apps/mobile-web/src/screens/funnel/sessionMemory.ts`: ergänzt `rememberReturnTo`/`rememberedReturnTo` für `/app/…`-Pfade unter dem `sessionStorage`-Key `steuereule.returnTo`.
- `apps/mobile-web/src/screens/funnel/sessionMemory.test.tsx`: testet `rememberReturnTo`/`rememberedReturnTo` inkl. Reject nicht-`/app/`-fremder Pfade und blockiertem `sessionStorage`.
- `e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`: ergänzt die Prüfung für Direktaufruf `/app/steuerjahr/2025/kapital`, `page.reload()` und Browser-Zurück (`page.goBack()`).
- `docs/agent-prompts/443-batch-report.md`: legt diesen Batch-Bericht an (Abschnitt Slice 1).

### 4. Abweichungen vom Auftrag
- **`ProfileHome` und `Privacy` in `ProfileStack.tsx` ohne `<RequiresAccount>`:** In `443-slice-1-navigation.md` (Schritt 5) steht, alle anderen Cockpit- und Profil-Routen außer `CockpitHome`/`Interview`/`AccountWall`/`Owl`/`Receipts` bräuchten ein Konto. Die bestehenden Tests in `apps/mobile-web/App.test.tsx` („reaches Profil from Cockpit through the tab bar“ und „reaches Datenschutz … — a guest sees the honest no-account notice“) sowie `PrivacyScreen` selbst erwarten jedoch explizit, dass Gäste `Profil` und `Datenschutz` öffnen dürfen (mit ehrlicher „Noch kein Konto“-Anzeige). Um die bestehenden Tests nicht zu brechen oder abzuschwächen, wurden nur `Security` und `ProfileMasterData` mit `<RequiresAccount>` umschlossen (siehe Offene Fragen).
- **Verdeckte Routen innerhalb desselben Stacks (`renderActiveStackRoute` in `guards.ts`):** Unter Web rendert `@react-navigation/native-stack` zurückliegende Stack-Routen mit `display: none` weiter im DOM, was bei Navigationen wie `Catalog → onBack` doppelte Zurück-Buttons (`Zurück`) für Accessibility-Queries erzeugt. Deshalb rendert `renderActiveStackRoute` jeweils nur die aktive Stack-Route; über Tab-Wechsel (`AppTabs`) bleiben alle Tab-Zustände und aktiven Masken vollständig erhalten (AC 1).
- **Dateinamen (`linking.test.tsx` statt `.ts`, Aufteilung `CockpitStack` in Tunnel-/Detailrouten & `guards.ts`):** Wegen der Vitest-Include-Konfiguration (`*.test.tsx`) und des 300-Zeilen-Limits aus A5 wurden Routen-Wrapper modular aufgeteilt.
- **Lokale E2E-Portkonfiguration:** Da Port `5432` belegt ist, wurden die E2E-Gates per `ATTACH`-Modus gegen `localhost:5434` ausgeführt (siehe Hinweis oben).

### 5. Angepasste bestehende Tests/Szenarien
- **`apps/mobile-web/App.test.tsx`:** Bestehende Tests wurden **nicht** verändert; 11 neue Tests für Slice 1 wurden ergänzt.
- **`apps/mobile-web/src/screens/funnel/sessionMemory.test.tsx`:** Bestehende Tests unverändert; 1 Test zu `rememberReturnTo`/`rememberedReturnTo` + Storage-Fallback-Assertion ergänzt.
- **`e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`:** Am Ende (Zeilen 133–144) wie in Slice 1 Schritt 7 gefordert um Direkt-URL-Aufruf, `page.reload()` und `page.goBack()` ergänzt. Alle übrigen 23 E2E-Szenarien blieben unverändert.

### 6. Ergebnis jedes Gate-Befehls (A2)
- `pnpm lint`: **grün** (`oxlint --deny-warnings`: 0 warnings, 0 errors auf 879 Dateien).
- `pnpm -r typecheck`: **grün** (alle Workspace-Pakete inkl. `api-client`, `core`, `tokens`, `ui`, `api`, `mobile-web`).
- `pnpm -r test`: **grün** (`apps/website` 5/5, `packages/api-client` 12/12, `packages/tokens` 45/45, `packages/core` 693/693, `packages/ui` 63/63, `apps/api` 873/873, `apps/mobile-web` 712/712).
- `node e2e/scenarios/run-all-scenarios.mjs` (über `ATTACH` an `localhost:5434` / `:3301` / `:4173`): **grün** (`ALL 24 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!`).
- `pnpm --filter @steuereule/e2e no-client-persistence` (über `ATTACH`): **grün** (`PASS — localStorage: {} · sessionStorage: {}` an allen 5 Checkpoints).
- `pnpm --filter @steuereule/e2e breakpoint-layout` (über `ATTACH`): **grün** (`PASS — all breakpoint layout assertions succeeded` über 375–1920 px).

### 7. Offene Fragen
1. Sollen `ProfileHome` (`/app/profil`) und `Privacy` (`/app/profil/datenschutz`) wie bisher für Gäste zugänglich bleiben (DSGVO-Transparenz & bestehende Tests in `App.test.tsx`), oder sollen sie künftig ebenfalls durch `<RequiresAccount>` auf `AccountWall` umgeleitet werden (inkl. Anpassung der Gast-Profil-Tests)?
2. Im Slice-1-Auftrag Abschnitt 5 heißt `@react-navigation/bottom-tabs@^7` (installiert und auf `@react-navigation/native@7.3.14` abgestimmt mit `^7.18.14`, weil `7.21.0` zur Laufzeit ein `TypeError: render is not a function` mit dem installierten `@react-navigation/native` auslöste). Soll `@react-navigation/native` langfristig separat mit hochgezogen werden?

---

## Slice 2 — Hub-Cockpit

### 1. Status
**angehalten (Stopp-Regel 4)**

Begründung für das Anhalten (Teil A3 Nr. 4 i. V. m. Slice 2 Abschnitt 2.4):
Abschnitt 2.4 verlangt ausdrücklich:
> *„`apps/api/src/tax-estimate/tax-estimate.service.ts`: Die Zahl der `AMOUNT_LATER`-Antworten des Jahres erhöht die Anzahl offener Posten, aus der die Spanne entsteht. Verwende dafür den **vorhandenen** Mechanismus (`UNCERTAINTY_PER_ITEM` aus `packages/core/src/interview/cockpit.ts`, Spanne in `cockpit-range.ts`). Keine neue Rechenformel. Wenn dort nicht klar ist, wie offene Posten in die Spanne eingehen: Stopp-Regel 4.“*

Die Code-Prüfung vor Implementierungsbeginn zeigt, dass in `TaxEstimateService` (`apps/api/src/tax-estimate/tax-estimate.service.ts`) sowie in den zugrunde liegenden Core-Schätzfunktionen (`taxEstimateEmployee`, `taxEstimateCrossBorder` in `packages/core/src/engine/tax-estimate.ts` und `estimateMarriedCouple` in `packages/core/src/engine/married-estimate.ts`) **kein** vorhandener `openItems`-/Unsicherheitsmechanismus über `UNCERTAINTY_PER_ITEM` oder `cockpit-range.ts` existiert und `cockpitRange` / `cockpitRangeFromInputs` sich ohne Erfindung einer neuen Rechenformel nicht auf `TaxEstimate` übertragen lassen (Details unter „Offene Fragen“ Nr. 1).

Gemäß Teil A3 wurde der gesamte Batch daher sofort angehalten, ohne Teiländerungen an Slice 2 vorzunehmen oder die Slices 3–7 zu beginnen.

### 2. Branch und letzter Commit-Hash
- Branch: `feat/443-s2-hub-cockpit` (abgezweigt von `feat/443-s1-navigation` bei `405f6c78621bb65e8516b137dd78fba14a06707b`)
- Letzter Code-/Test-Commit vor diesem Bericht-Commit: `405f6c78621bb65e8516b137dd78fba14a06707b` (`docs(navigation): add Slice 1 batch report`, unveränderter Code-Stand ab Slice 1); direkt im Anschluss folgt auf `feat/443-s2-hub-cockpit` der Commit dieses Berichts als `HEAD`.

### 3. Geänderte und neue Dateien
- `docs/agent-prompts/443-batch-report.md`: dokumentiert den Haltepunkt (Stopp-Regel 4) für Slice 2 sowie den Abschlussabschnitt „Gesamt“ nach Teil D (es wurde bewusst kein Produktiv- oder Testcode auf `feat/443-s2-hub-cockpit` geändert).

### 4. Abweichungen vom Auftrag
- **keine** (der Haltepunkt wurde wörtlich gemäß Teil A3 Stopp-Regel 4 und Slice 2 § 2.4 vor einer nicht spezifizierten Formeländerung ausgeführt).

### 5. Angepasste bestehende Tests/Szenarien
- **keine**

### 6. Ergebnis jedes Gate-Befehls (A2)
Der Code- und Teststand auf `feat/443-s2-hub-cockpit` ist gegenüber dem vollständig verifizierten Slice-1-Abschluss (`405f6c78621bb65e8516b137dd78fba14a06707b`) unverändert. Verifikation auf `feat/443-s2-hub-cockpit`:
- `pnpm lint`: **grün** (`oxlint --deny-warnings`: 0 warnings, 0 errors auf 879 Dateien).
- `pnpm -r typecheck`: **grün** (alle 8 Workspace-Projekte ohne Fehler).
- `pnpm -r test`: **grün** (`apps/website` 5/5, `packages/api-client` 12/12, `packages/tokens` 45/45, `packages/core` 693/693, `packages/ui` 63/63, `apps/api` 873/873, `apps/mobile-web` 712/712).
- `node e2e/scenarios/run-all-scenarios.mjs`: auf diesem Branch wegen Haltepunkt vor Code-Änderungen nicht erneut gestartet (identischer Code-Stand `405f6c7` war am Ende von Slice 1 komplett grün: 24/24 Szenarien im `ATTACH`-Modus).
- `pnpm --filter @steuereule/e2e no-client-persistence`: auf diesem Branch nicht erneut gestartet (identischer Code-Stand `405f6c7` in Slice 1 grün).
- `pnpm --filter @steuereule/e2e breakpoint-layout`: auf diesem Branch nicht erneut gestartet (identischer Code-Stand `405f6c7` in Slice 1 grün).

### 7. Offene Fragen
1. **Blocker aus § 2.4 (`TaxEstimateService` vs. `CockpitService` und `UNCERTAINTY_PER_ITEM`):**
   - `UNCERTAINTY_PER_ITEM` (`60`, `packages/core/src/interview/cockpit.ts`) und `cockpitRange` / `cockpitRangeFromInputs` (`packages/core/src/interview/cockpit-range.ts`) werden aktuell **ausschließlich** in `apps/api/src/cockpit/cockpit.service.ts` (und `apps/api/prisma/seed.ts`) für das **Erfasste Einkommen** (`CockpitSummaryDto.status`) verwendet, **nicht** in `apps/api/src/tax-estimate/tax-estimate.service.ts` für die **Steuerschätzung (Erstattung/Nachzahlung)**.
   - In `packages/core/src/engine/tax-estimate.ts` (`taxEstimateEmployee`, `taxEstimateCrossBorder`) und `packages/core/src/engine/married-estimate.ts` (`estimateMarriedCouple`) entsteht `TaxEstimate.result` ausschließlich aus fachlichen Unsicherheitsintervallen (`SV_DEDUCTIBLE = 0.91..0.93`, CH-Deckelung `maxOtherProvisionEur`, ggf. `CHURCH_TAX_RATE = 0.08..0.09`). Weder `TaxEstimate` noch `TaxEstimateDto` (`apps/api/src/tax-estimate/dto/tax-estimate.dto.ts`) kennen `openItems`.
   - `cockpitRange` / `cockpitRangeFromInputs` lassen sich nicht ohne neue Rechenformel auf `TaxEstimate.result` anwenden:
     - `cockpitRange` akzeptiert nur eine einzelne nicht-negative Zahl (`estimate < 0` wirft `RangeError` in `cockpit.ts:19-21`), und beide Funktionen kappen `from` bei `Math.max(0, sum - uncertainty)` (`cockpit.ts:43`, `cockpit-range.ts:42`). `TaxEstimate.result` ist aber bereits ein Intervall `{ from, to }` und bei Nachzahlungen regelmäßig **negativ** (z. B. CH-Grenzgänger in `apps/api/test/tax-estimate.service.test.ts:146`, `to < 0`, oder vorzeichenwechselnd `offenesErgebnis` in `CockpitScreen.tsx:193`).
     - In § 2.5 heißt es *„dass eine `spaeter`-Antwort die Spanne um **genau** `UNCERTAINTY_PER_ITEM` verbreitert“* (`+60 €` Breite), während `cockpitRange` beide Ränder um `± UNCERTAINTY_PER_ITEM` verschiebt (`from - 60`, `to + 60`, Gesamtbreite `+120 €`).
     - Unspezifiziert sind zudem: (a) Wirkt der Zuschlag direkt auf `result` oder auf vorgelagerte Bemessungsgrundlagen (`taxableIncome` / `specialExpenses` / `werbungskosten`, inkl. Pauschbetrags-Schwellen wie `1.230 €` / `36 €`)? (b) Erfolgt die Verbreiterung symmetrisch (`±60` / `±30`) oder gerichtet (Abzüge erhöhen maximal `result.to`, Einnahmen/Progressionsvorbehalt senken `result.from`)? (c) Müssen auch `taxableIncome` / `incomeTax` im `TaxEstimateDto` verbreitert werden? (d) Zählen bei `estimateMarriedCouple` die `AMOUNT_LATER`-Antworten beider Ehegatten (`personA` + `personB`) zusammen?
   - Falls statt oder zusätzlich zu `TaxEstimateService` die Einkommensspanne in `apps/api/src/cockpit/cockpit.service.ts` (`CockpitSummaryDto.status`) durch `AMOUNT_LATER` erweitert werden soll: `apps/api/src/cockpit/cockpit.service.ts` steht in § 2.4 **nicht** auf der A5-Ausnahmeliste (*„Erlaubte Ausnahme: `packages/core` und `apps/api/src/tax-estimate`“*), enthält aber `crossBorderFacts` direkt im Service (während `employeeFromData` im Core `openItems` berechnet, aktuell aber nur fehlende LStB-Felder und `nebenjob` mit `sideJobGross === 0`). Soll die A5-Ausnahme auf `apps/api/src/cockpit` erweitert werden?
2. **Sekundäre Klärungen zu § 2.4 (`isValidAnswer` und Sonderfälle):**
   - `apps/api/src/interview/interview.service.ts:91` prüft Antworten gegen `isValidAnswer` (`packages/core/src/interview/interview.ts:480`). `isAccepted` lässt bei `integer`-Schritten aktuell nur Ganzzahlen innerhalb `[min, max]` zu und würde `'spaeter'` mit `400 ANSWER_VALUE_INVALID` ablehnen. Soll `isValidAnswer` (im erlaubten `packages/core`) `'spaeter'` für genau die Betragsschritte im Katalog akzeptieren (und für `weg`, `tage`, `ch-nichtrueckkehrtage` weiterhin ablehnen)?
   - Welche konkreten Schritte gelten neben `parseAmount` in `health-insurance.ts` als Betragsschritte für `0 €`-Fallback (u. a. `intFrom` in `packages/core/src/domains/employee.ts`, `integerFrom` in `packages/core/src/interview/progression-clause.ts`, `integer` / `Number` in `apps/api/src/advisor/advisor.service.ts`, `apps/api/src/owl-mode/owl-mode.service.ts`, `apps/api/src/printout/printout.service.ts`)?
   - Was gilt in `TaxEstimateService.getState`, wenn `abfindung-betrag`, `lohnersatz-betrag` oder `nebenjob-brutto` auf `'spaeter'` steht (`specialCircumstance(answers)` gibt bereits bei `abfindung === 'Ja'`, `lohnersatz === 'Ja'`, `nebenjob === 'Midijob'/'Nebenjob'` pauschal `{ kind: 'nicht-moeglich', reason: 'besondere-lebenslage' }` zurück)?
3. **Vorgesehene Klärungen aus § 2.2 (Kachel-Status anhand der vorhandenen Query-Hooks):**
   - `ch` (`useChSalaryCertificateControllerGet`): Da das DTO auch ohne Nutzereingabe ein Objekt zurückgibt (`fields`, `status`, `foldStatus`, `exchangeRate`), gilt die Kachel als „erledigt“, sobald `foldStatus?.kind === 'bestimmt' && exchangeRate !== null` (oder bereits sobald mindestens ein Feld erfasst ist)?
   - `rente` (`usePensionControllerGet`): `PensionResponseDto` liefert stets ein Objekt (`kind: string | null`, `status.kind: 'bestimmt' | 'offen'`). Gilt `status.kind === 'bestimmt'` als „erledigt“?
   - `kapital` (`useCapitalControllerGet`) und `vermietung` (`useRentalControllerGet`): Gilt „erledigt“ bereits ab einem vorhandenen Eintrag (`kapitalertraege.kind === 'erfasst'` bzw. `properties.length > 0`) oder erst bei `status.kind === 'bestimmt'`?

---

## Gesamt

### 1. Angelegte Branches und letzter Commit-Hash
- `feat/443-s1-navigation` — `405f6c78621bb65e8516b137dd78fba14a06707b` (`docs(navigation): add Slice 1 batch report`; letzter Code-/Test-Commit: `6744999c218f394fc730562fe6e8c5773a2b4508`). Status: **fertig**.
- `feat/443-s2-hub-cockpit` — Code-Stand unverändert bei `405f6c78621bb65e8516b137dd78fba14a06707b`; unmittelbar anschließender Bericht-/Haltepunkt-Commit dieses Berichts bildet `HEAD` dieses Branches. Status: **angehalten (Stopp-Regel 4 in Abschnitt 2.4)**.
- `feat/443-s3-submission-gate` bis `feat/443-s7-keyboard-haptics` — **nicht angelegt** (Batch nach Teil A3 wegen Stopp-Regel 4 in Slice 2 beendet).

### 2. Liste aller offenen Fragen (aus allen Slices)
- **Slice 1 Nr. 1:** Sollen `ProfileHome` (`/app/profil`) und `Privacy` (`/app/profil/datenschutz`) wie bisher für Gäste zugänglich bleiben (DSGVO-Transparenz & bestehende Tests in `apps/mobile-web/App.test.tsx`), oder künftig über `<RequiresAccount>` auf `AccountWall` umgeleitet werden?
- **Slice 1 Nr. 2:** `@react-navigation/bottom-tabs` wurde passend zu `@react-navigation/native@7.3.14` mit `^7.18.14` gepinnt (`7.21.0` warf zur Laufzeit `TypeError: render is not a function`). Soll `@react-navigation/native` langfristig separat aktualisiert werden?
- **Slice 2 Nr. 1 (Haltepunkt Stopp-Regel 4):** Wie genau sollen `AMOUNT_LATER`-Antworten (`'spaeter'`) über `UNCERTAINTY_PER_ITEM` die Spanne in `TaxEstimateService` (`TaxEstimateDto.result`, Erstattung/Nachzahlung — inkl. negativer Werte, Richtung, Breite `+60 €` vs. `±60 €`, Pauschbetrag-Schwellen und Ehepaar-Split) und/oder in `CockpitService` (`CockpitSummaryDto.status`, Einkommensspanne — dafür ggf. A5-Ausnahme für `apps/api/src/cockpit`) beeinflussen?
- **Slice 2 Nr. 2:** Soll `isValidAnswer` (`packages/core/src/interview/interview.ts`) `'spaeter'` explizit für Betragsschritte erlauben, und wie soll `TaxEstimateService` mit `'spaeter'` bei `abfindung-betrag`/`lohnersatz-betrag`/`nebenjob-brutto` (bisher pauschal `besondere-lebenslage`) umgehen?
- **Slice 2 Nr. 3:** Eindeutige „erledigt“-Bedingung der Kacheln `ch` (`foldStatus?.kind === 'bestimmt' && exchangeRate !== null`), `rente` (`status.kind === 'bestimmt'`), sowie `kapital` / `vermietung` (Mindesteintrag vs. `status.kind === 'bestimmt'`).

### 3. Lokale Gate-Ausführung (A2)
- **Port-Konflikt auf Port `5432`:** Auf diesem Rechner ist Port `5432` bereits durch einen anderen lokalen Postgres-Dienst belegt. Alle E2E-Läufe wurden daher auf einer separaten Postgres-16-Instanz unter `localhost:5434` (`steuereule_e2e_443`, `libpq` unter `/opt/homebrew/opt/libpq/bin`) im `ATTACH`-Modus gegen die gebaute API (`:3301`) und das Web-Export-Bundle (`:4173`) mit echtem Chromium-Browser ausgeführt.
- **Slice 1 (`feat/443-s1-navigation`):** Alle 6 Gate-Befehle (`pnpm lint`, `pnpm -r typecheck`, `pnpm -r test`, `node e2e/scenarios/run-all-scenarios.mjs` [24/24], `no-client-persistence`, `breakpoint-layout`) **lokal vollständig gelaufen und grün**.
- **Slice 2 (`feat/443-s2-hub-cockpit`):** Vor Code-Änderungen angehalten. Auf diesem Branch wurden `pnpm lint`, `pnpm -r typecheck` und `pnpm -r test` erneut ausgeführt (alle grün); die 3 E2E-Befehle wurden auf `feat/443-s2-hub-cockpit` nicht erneut gestartet, da der Code-Stand zu Slice 1 (`405f6c7`) identisch ist.
- **Slices 3–7:** Nicht gestartet / keine Gate-Läufe.
