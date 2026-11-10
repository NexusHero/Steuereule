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
**fertig** (PR-#449-Antworten umgesetzt; vorheriger Haltepunkt zu § 2.4 vollständig aufgelöst)

### 2. Branch und letzter Commit-Hash
- Branch: `feat/443-s2-hub-cockpit` (abgezweigt von `feat/443-s1-navigation` bei `405f6c78621bb65e8516b137dd78fba14a06707b`)
- Letzter Code-/Test-Commit vor diesem Bericht-Commit: `f4cd8b96ed384fbb92d055bce6bb2d5f082dd0db` (`test(e2e): adapt scenarios for hub cockpit and deferred amount roundtrip`); umfasst außerdem die PR-#449-Review-Fixes R2–R5 (`a3e59ba`, `0015103`, `6806df0`), § 2.4 (`da6ad81`, `e47cdd0`, `47ec891`) und § 2.1–2.3 (`59c2351`, `91837a4`, `60ea864`, `8752858`). Dieser Bericht folgt unmittelbar als Abschluss-Commit auf `feat/443-s2-hub-cockpit`.

### 3. Geänderte und neue Dateien
- `apps/api/openapi.json`: aktualisiert die OpenAPI-Spezifikation um das optionale Feld `TaxEstimateDto.laterAmounts`.
- `apps/api/src/advisor/advisor.service.ts`: ersetzt lokales `Number(...)`-Betrags-Parsing für Katalog-Beträge durch `amountFromAnswer`, sodass `'spaeter'` als `null` statt `NaN` behandelt wird.
- `apps/api/src/owl-mode/owl-mode.service.ts`: ersetzt lokales `parsePositiveInt`-Parsing für Katalog-Beträge durch `amountFromAnswer`, sodass `'spaeter'` nicht zu `NaN` oder Fehlsummen führt.
- `apps/api/src/printout/printout.service.ts`: nutzt `amountFromAnswer` beim Lesen von Katalog-Beträgen (`dhf-miete`, `umzug-kosten`, `spenden-betrag`, `riester-betrag`, `kv-pv-betrag` etc.) für den PDF-Druck.
- `apps/api/src/tax-estimate/dto/tax-estimate.dto.ts`: ergänzt die optionale Property `laterAmounts?: number` mit `@ApiPropertyOptional`.
- `apps/api/src/tax-estimate/tax-estimate.service.ts`: zählt `laterAmountSteps` des Steuerjahres (bei Zusammenveranlagung beider Personen), verbreitert bei `kind === 'spanne'` das `result` per `widenForLaterAmounts` und setzt `laterAmounts` bei Anzahl `> 0`.
- `apps/api/test/advisor.service.test.ts`: ergänzt einen Service-Test, dass `'spaeter'` in `CaseDigest` zu `null` statt `NaN` ausgewertet wird.
- `apps/api/test/interview.service.test.ts`: testet `postAnswer` mit `'spaeter'` für erlaubte Schritte (`spenden-betrag`) sowie Ablehnung (`InvalidAnswerValueError`) für nicht erlaubte Integer-Schritte.
- `apps/api/test/openapi-contract.test.ts`: prüft die OpenAPI-Deklaration von `TaxEstimateDto.laterAmounts`.
- `apps/api/test/owl-mode.service.test.ts`: ergänzt einen Test, dass `'spaeter'` im Eulen-Kontext sicher als `null`/`0` geparst wird.
- `apps/api/test/printout.service.test.ts`: ergänzt einen Unit-Test, dass `'spaeter'` beim PDF-Befüllen keinen `NaN`-Eintrag erzeugt.
- `apps/api/test/tax-estimate.service.test.ts`: testet, dass eine `'spaeter'`-Antwort `result.to` genau um `UNCERTAINTY_PER_ITEM` (`60 €`) bei unverändertem `result.from` erhöht (und bei Ehepaaren doppelt zählt).
- `apps/mobile-web/App.test.tsx`: passt die Tunnel-Erwartungen auf Hub-Cockpit (`onDone`/`onBack` → `CockpitHome`) an und ergänzt Tests zu `cockpit-weiter`, ausgeblendetem CTA nach Abschluss aller Schritte und `revisit` über Kacheln.
- `apps/mobile-web/App.tsx`: löscht in `onSignedOut` zusätzlich `rememberReturnTo(null)` beim Ausloggen (PR #449 Review R2).
- `apps/mobile-web/package.json`: pinnt `@react-navigation/bottom-tabs` als `~7.18.14` statt `^7.18.14` passend zur installierten `@react-navigation/native`-Version (PR #449 Review R3).
- `apps/mobile-web/src/i18n/resources.ts`: ergänzt i18n-Texte (`de` & `en`) für `cockpit.naechsterSchritt`, `cockpit.kachel.*`, `plausibilitaet.hinweis.betrag-spaeter` und `katalog.amountLater`.
- `apps/mobile-web/src/navigation/AppTabs.tsx`: dokumentiert im Kommentar die bewusste Inaktiv-Anzeige (nicht Fokus-abhängig) von Tab-Screens unter `@react-navigation/bottom-tabs` (PR #449 Review R4).
- `apps/mobile-web/src/navigation/CockpitStack.tsx`: übergibt `onOpenTile` an `CockpitScreen` und navigiert anhand von `TileDefinition` + `revisit` zur passenden Maske.
- `apps/mobile-web/src/navigation/CockpitTunnelRoutes.tsx`: löst die alten Tunnel-Kanten für `Lstb`, `CrossBorder`, `Catalog` und `Workdays` auf (`onDone` und `onBack` → `CockpitHome`).
- `apps/mobile-web/src/screens/capital/CapitalScreen.test.tsx`: erweitert die Test-Hilfsfunktion um `queryClient`/`onBack` und testet Cache-Invalidierung sowie Warten auf laufende Mutationen.
- `apps/mobile-web/src/screens/capital/CapitalScreen.tsx`: wartet vor `onDone` laufende Speicher-Mutationen ab und invalidiert abhängige Queries (`cockpitSummary`, `taxEstimate`, `capital`).
- `apps/mobile-web/src/screens/catalog/CatalogScreen.test.tsx`: ergänzt Tests für `katalog-later-<step>` (nur bei `LATER_ALLOWED_STEPS`), Speichern von `'spaeter'` und Query-Invalidierung beim Abschluss.
- `apps/mobile-web/src/screens/catalog/CatalogScreen.tsx`: ergänzt den leisen Button `katalog-later-<step>` („Betrag später eintragen“) für `LATER_ALLOWED_STEPS` und invalidiert beim Abschluss/Antworten Cockpit-, Schätz- und Interview-Caches.
- `apps/mobile-web/src/screens/children/ChildrenScreen.test.tsx`: ergänzt Tests für Cache-Invalidierung und `onBack` vor Verlassen von `ChildrenScreen`.
- `apps/mobile-web/src/screens/children/ChildrenScreen.tsx`: synchronisiert Mutationen und invalidiert Cockpit-/Schätz-Queries vor `onDone`.
- `apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`: grenzt bestehende „Weiter mit deinem Weg“-Tests auf Gastmodus (`isSignedIn: false`) ein und ergänzt Hub-Cockpit-Tests zu Kachel-Status, `betrag-offen`, Reihenfolge von `cockpit-weiter` und `revisit`.
- `apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx`: bindet `useCockpitTileFacts`, `<CockpitTiles>` und `nextStepTile` für `cockpit-weiter` („Nächster Schritt: {{titel}}“) ein.
- `apps/mobile-web/src/screens/cockpit/CockpitTiles.tsx`: neue UI-Komponente zum Laden der Query-Fakten (`useCockpitTileFacts`) und Rendern der Hub-Kacheln mit `Card`, Status-Label (`offen`/`erledigt`/`⏳ Betrag offen`) und `revisit`-Berechnung.
- `apps/mobile-web/src/screens/cockpit/tiles.test.tsx`: neue Unit-Testsuite für `TILES`, Sichtbarkeitsregeln, Statusermittlung aller 10 Kacheln inkl. `betrag-offen`, `nextStepTile` pro Pfad und `hasAnswersForEntry`.
- `apps/mobile-web/src/screens/cockpit/tiles.ts`: reine Definition von `TILES`, `NEXT_STEP_ORDER`, `nextStepTile`, `visibleTiles` und `hasAnswersForEntry` ohne React-Abhängigkeiten.
- `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.test.tsx`: ergänzt Tests für `onBack` und Abwarten laufender Mutationen + Query-Invalidierung vor `onDone`.
- `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx`: ergänzt `onBack`-Prop, wartet laufende Mutationen vor `onDone` ab und invalidiert abhängige Queries.
- `apps/mobile-web/src/screens/interview/InterviewScreen.test.tsx`: testet Query-Invalidierung beim Abschließen des Minimal-Gate-Interviews.
- `apps/mobile-web/src/screens/interview/InterviewScreen.tsx`: invalidiert `cockpitSummary`, `taxEstimate` und `interview` vor `onDone`.
- `apps/mobile-web/src/screens/lstb/LstbScreen.test.tsx`: ergänzt Tests für Abwarten laufender Feld-PUTs und Cache-Invalidierung bei `lstb-weiter`.
- `apps/mobile-web/src/screens/lstb/LstbScreen.tsx`: nutzt `usePendingMutations`, wartet vor `onDone` auf laufende LStB-Mutationen und invalidiert abhängige Queries.
- `apps/mobile-web/src/screens/pension/PensionerScreen.test.tsx`: ergänzt Tests für `onBack`, Mutationen-Wait und Query-Invalidierung.
- `apps/mobile-web/src/screens/pension/PensionerScreen.tsx`: ergänzt `onBack`, wartet auf laufende Mutationen vor `onDone` und invalidiert Cockpit-/Schätz-Caches.
- `apps/mobile-web/src/screens/plausibility/PlausibilityScreen.test.tsx`: ergänzt einen Test für den Notice `betrag-spaeter` ohne Blockade des Einreichstatus.
- `apps/mobile-web/src/screens/plausibility/PlausibilityScreen.tsx`: übergibt `answers` an `checkPlausibility`, damit `betrag-spaeter` erkannt wird.
- `apps/mobile-web/src/screens/rental/RentalScreen.test.tsx`: ergänzt Tests für `onBack`, laufende Mutationen und Query-Invalidierung.
- `apps/mobile-web/src/screens/rental/RentalScreen.tsx`: wartet laufende Mutationen vor `onDone` ab und invalidiert Cockpit-/Schätz-/Vermietungs-Queries.
- `apps/mobile-web/src/screens/shared/usePendingMutations.ts`: neuer kleiner Hilfs-Hook (`useIsMutating`-gestütztes Abwarten offener Schreibvorgänge vor Screen-Abschluss).
- `apps/mobile-web/src/screens/workdays/WorkdaysScreen.test.tsx`: ergänzt Tests für `onBack` und Cache-Invalidierung nach dem Speichern.
- `apps/mobile-web/src/screens/workdays/WorkdaysScreen.tsx`: ergänzt `onBack`, wartet auf laufende Arbeitsweg-Mutationen und invalidiert abhängige Queries vor `onDone`.
- `docs/agent-prompts/443-batch-report.md`: aktualisiert Abschnitt „Slice 2 — Hub-Cockpit“ auf den fertigen Stand mit allen Prüfungs- und Dateinachweisen.
- `e2e/scenarios/01-lena-hoffmann-angestellt.mjs`: stellt den Tunnel-Durchlauf auf `nextStep(page)` um und überbrückt die weggefallene automatische Plausibilitäts-Kante vorübergehend bis Slice 3 via Direkt-URL `/plausibilitaet`.
- `e2e/scenarios/02-markus-brenner-grenzgaenger-ch.mjs`: ersetzt automatische Tunnel-Übergänge nach Schweizer Lohnausweis und Katalog-Masken durch `nextStep(page)`.
- `e2e/scenarios/03-julia-brenner-grenzgaengerin-ch.mjs`: ersetzt automatische Tunnel-Übergänge in Markus' und Julias Durchlauf durch `nextStep(page)`.
- `e2e/scenarios/04-weber-ehepaar-zusammenveranlagung.mjs`: stellt den Flow auf `nextStep(page)` um und öffnet `/plausibilitaet` vorübergehend direkt vor dem Veranlagungsvergleich.
- `e2e/scenarios/06-sarah-fischer-homeoffice-riester.mjs`: stellt den Flow auf `nextStep(page)` um und prüft zusätzlich den § 2.4/§ 2.6-Roundtrip (`umzug-kosten` → `katalog-later-umzug-kosten` → Status `⏳ Betrag offen` → Revisit über `openTile` → Betrag `1500` → Status `Erledigt`).
- `e2e/scenarios/07-david-richter-alleinerziehend.mjs`: stellt die Schrittfolge auf `nextStep(page)` um und prüft Plausibilität vor dem Veranlagungsvergleich über `/plausibilitaet`.
- `e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`: präzisiert die Kommentare zur `page.goBack()`-Prüfung (PR #449 Review R5).
- `e2e/scenarios/10-florian-weber-hybrid-beides.mjs`: ergänzt `nextStep(page)` vor dem Arbeitsweg nach dem Hub-Return aus `sonderausgaben`.
- `e2e/scenarios/12-carlos-santos-expat-ch-only-gate.mjs`: ergänzt `nextStep(page)` zwischen LStB und `lebenslagen`-Katalog.
- `e2e/scenarios/13-erika-zimmermann-verwitwet.mjs`: ergänzt `nextStep(page)` zwischen LStB und `lebenslagen`-Katalog.
- `e2e/scenarios/14-keller-ehepaar-veranlagungsvergleich.mjs`: stellt Katalog-/Maskenwechsel auf `nextStep(page)` um und öffnet `/plausibilitaet` direkt bis zum Slice-3-Gate.
- `e2e/scenarios/15-martina-vogt-hybrid-schweiz.mjs`: nutzt nach dem CH-Lohnausweis explizit `openTile(page, 'einkuenfte' | 'sonderausgaben' | 'arbeitsweg')`, da ein partieller CH-Datensatz noch nicht erledigt ist.
- `e2e/scenarios/16-sabine-kranz-geschieden-kind.mjs`: stellt den Durchlauf auf `nextStep(page)` um und ruft `/plausibilitaet` direkt auf.
- `e2e/scenarios/17-maximilian-allesgeber-maximal-katalog.mjs`: wechselt zwischen LStB und den drei Katalogen über `nextStep(page)`.
- `e2e/scenarios/18-thorsten-grenzfall-arbeitstage-widerspruch.mjs`: prüft nach Arbeitsweg-Speicherung Kachel-Status `Erledigt` und Plausibilität via `nextStep(page)` bzw. `/plausibilitaet`.
- `e2e/scenarios/20-dialog-matrix-kataloge-zickzack.mjs`: passt Zickzack- und Revisit-Prüfungen über `nextStep(page)` und `openTile(page, …)` an das Hub-Cockpit an.
- `e2e/scenarios/21-dialog-matrix-submasken-und-partner-b.mjs`: ersetzt den Tunnel bis Arbeitsweg durch `nextStep(page)` und öffnet `/plausibilitaet` direkt vor dem Vergleich.
- `e2e/scenarios/22-dialog-matrix-crud-detailmasken.mjs`: nutzt `nextStep(page)` nach Abschluss der LStB für `lebenslagen`.
- `e2e/scenarios/23-dialog-matrix-gast-upgrade-und-steuerjahre.mjs`: ergänzt `nextStep(page)` zwischen Schweizer Lohnausweis (2025) und Katalog.
- `e2e/scenarios/24-advisor-chat-steuereule.mjs`: stellt den Ausgangs-Flow vor dem Eule-Chat auf `nextStep(page)` und `/plausibilitaet` um.
- `e2e/scenarios/helpers/scenario-harness.mjs`: ergänzt die in § 2.6 geforderten Helfer `openTile(page, tileId)` und `nextStep(page)`.
- `packages/api-client/src/generated/steuerschaetzung.faker.ts`: generiert das optionale Feld `laterAmounts` für Faker-Mocks mit.
- `packages/api-client/src/generated/steuerschaetzung.msw.ts`: aktualisiert die generierten MSW-Handler anhand der neuen OpenAPI-Spec.
- `packages/api-client/src/generated/steuerschaetzung.schemas.ts`: ergänzt `laterAmounts?: number` im generierten TypeScript-Schema `TaxEstimateDto`.
- `packages/core/src/domains/employee.test.ts`: testet `employeeFromAnswers` / `employeeFromData` mit `'spaeter'` als `0 €`-Fallback ohne `NaN`.
- `packages/core/src/domains/employee.ts`: nutzt `amountFromAnswer` für `intFrom`-Betragsschritte aus der Allowlist.
- `packages/core/src/domains/health-insurance.test.ts`: testet `parseAmount` / `healthInsuranceFromAnswers` mit `'spaeter'` als `0 €`-Fallback.
- `packages/core/src/domains/health-insurance.ts`: ersetzt lokales `parseAmount`-Parsing der Katalog-KV/PV-Schritte durch `amountFromAnswer`.
- `packages/core/src/interview/cockpit.test.ts`: ergänzt Tests für `widenForLaterAmounts` bei `count` `0`, `1`, `3` sowie `RangeError` bei negativem `count`.
- `packages/core/src/interview/cockpit.ts`: exportiert `widenForLaterAmounts(range, count)` (erhöht `to` um `count * UNCERTAINTY_PER_ITEM` bei unverändertem `from`).
- `packages/core/src/interview/interview.test.ts`: testet `AMOUNT_LATER`, `LATER_ALLOWED_STEPS`, `laterAmountSteps` und `isValidAnswer` (erlaubte vs. verbotene Schritte).
- `packages/core/src/interview/interview.ts`: exportiert `AMOUNT_LATER`, `LATER_ALLOWED_STEPS`, `laterAmountSteps`, `amountFromAnswer` und lässt `'spaeter'` in `isValidAnswer` ausschließlich für `LATER_ALLOWED_STEPS` zu.
- `packages/core/src/interview/plausibility.test.ts`: ergänzt Tests für den Notice `betrag-spaeter`.
- `packages/core/src/interview/plausibility.ts`: ergänzt `PlausibilityInput.answers?` und erzeugt den Notice `{ kind: 'betrag-spaeter', steps }`, sobald `laterAmountSteps(answers)` nicht leer ist.
- `pnpm-lock.yaml`: speichert das exakte Tilde-Pinning `~7.18.14` für `@react-navigation/bottom-tabs`.

### 4. Abweichungen vom Auftrag
- **PR-#449-Review R1 (`renderActiveStackRoute` unmounted `CockpitHome`) bewusst auf Slice 4 belassen:** In Slice 2 ist für Nicht-Sheet-Routen kein gleichzeitiges Hintergrund-Rendern von `CockpitHome` nötig; R1 wird gezielt in Slice 4 (§ 4.2) umgesetzt, wenn die Sheet-Gruppe eingeführt wird. R2–R5 aus dem Review sind bereits auf diesem Branch behoben.
- **Vorübergehende Direkt-URL `/plausibilitaet` in Slice-2-E2E-Szenarien:** Da § 2.1 den Übergang `Workdays -> Plausibility` auflöst (zurück zu `CockpitHome`), es die Abgabe-Kachel `cockpit-abgabe-vorbereiten` aber erst ab Slice 3 gibt, rufen die Szenarien `01`, `04`, `06`, `07`, `14`, `16`, `18`, `21` und `24` in Slice 2 vorübergehend direkt `/app/steuerjahr/<jahr>/plausibilitaet` auf und werden in Slice 3 auf `cockpit-abgabe-vorbereiten` umgestellt.
- **Abwarten offener Schreib-Mutationen (`usePendingMutations.ts`) und Cache-Invalidierung:** Nach Wegfall des Tunnels landet ein „Weiter“-Klick unmittelbar wieder auf `CockpitHome`. Damit asynchrone Blur-/Submit-PUTs aus Detailmasken und Katalog zuverlässig noch vor dem Rücksprung abgeschlossen sind und Kachel-Status sowie Steuerschätzung sofort stimmen, warten die Masken über `useIsMutating()` kurz laufende Mutationen ab und invalidieren gezielt die betroffenen Queries.
- **Lokale E2E-Portkonfiguration:** Da Port `5432` belegt ist, wurden alle E2E-Gates im `ATTACH`-Modus gegen `localhost:5434` ausgeführt (siehe Hinweis am Anfang des Berichts).

### 5. Angepasste bestehende Tests/Szenarien
- **`apps/mobile-web/App.test.tsx`:** Der bisherige Tunnel-Test `tunnel unchanged: LStB onDone -> Catalog lebenslagen -> onDone -> Catalog einkuenfte -> onBack -> lebenslagen with revisit` prüfte explizit die in § 2.1 abgeschafften Tunnel-Kanten und wurde durch Tests für das Hub-Cockpit (`onDone`/`onBack` → `CockpitHome`, `cockpit-weiter`, ausgeblendeter Button nach Abschluss, `revisit`-Flag) ersetzt.
- **`apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`:** Im Block `"Weiter mit deinem Weg"` wurde ausdrücklich `isSignedIn: false` gesetzt, weil eingeloggte Nutzer nach fertig beantwortetem Minimal-Gate in Slice 2 die Hub-Kacheln + `"Nächster Schritt: ..."` (`cockpit-weiter`) sehen statt des alten Gast-Hinweises. Alle fachlichen Assertions blieben unangetastet.
- **`apps/mobile-web/src/screens/catalog/CatalogScreen.test.tsx`:** Hilfstyp um `'einkuenfte'` erweitert und neue Tests für `katalog-later-<step>` sowie Query-Invalidierung ergänzt; bestehende Tests unverändert.
- **`CapitalScreen.test.tsx`, `ChildrenScreen.test.tsx`, `CrossBorderScreen.test.tsx`, `InterviewScreen.test.tsx`, `LstbScreen.test.tsx`, `PensionerScreen.test.tsx`, `RentalScreen.test.tsx`, `WorkdaysScreen.test.tsx`:** Nur Render-Hilfsfunktionen um optionale `queryClient`/`onBack`-Parameter erweitert und neue Invalidierungs-/Mutation-Wait-/Zurück-Tests ergänzt.
- **`e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`:** Kommentare zur `page.goBack()`-Prüfung gemäß PR #449 R5 präzisiert.
- **`e2e/scenarios/{01,02,03,04,06,07,10,12,13,14,15,16,17,18,20,21,22,23,24}` & `e2e/scenarios/helpers/scenario-harness.mjs`:** Ausschließlich Navigationsschritte vom bisherigen Tunnel auf `nextStep(page)` / `openTile(page, id)` gemäß § 2.6 umgestellt (plus vorübergehendem `/plausibilitaet`-Aufruf vor Slice 3 sowie neuer Prüfung für „Betrag später eintragen“ in Szenario 06). Alle Euro-Beträge, PDF-Felder und Steuerberechnungen blieben unverändert.

### 6. Ergebnis jedes Gate-Befehls (A2)
Verifiziert auf dem abschließenden Code-/Test-Stand `f4cd8b96ed384fbb92d055bce6bb2d5f082dd0db`:
- `pnpm lint`: **grün** (`oxlint --deny-warnings`: 0 warnings, 0 errors auf 884 Dateien).
- `pnpm -r typecheck`: **grün** (alle 8 Workspace-Projekte ohne Fehler).
- `pnpm -r test`: **grün** (`apps/website` 5/5, `packages/api-client` 12/12, `packages/tokens` 45/45, `packages/core` 702/702, `packages/ui` 63/63, `apps/api` 881/881, `apps/mobile-web` 744/744). Zusätzlich `pnpm register-check`: **PASS**; `pnpm adr-check`: **PASS**.
- `node e2e/scenarios/run-all-scenarios.mjs` (über `ATTACH` an `localhost:5434` / `:3301` / `:4173`): **grün** (`ALL 24 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!`).
- `pnpm --filter @steuereule/e2e no-client-persistence` (über `ATTACH`): **grün** (`PASS — localStorage: {} · sessionStorage: {}` an allen 5 Checkpoints).
- `pnpm --filter @steuereule/e2e breakpoint-layout` (über `ATTACH`): **grün** (`PASS — all breakpoint layout assertions succeeded` über 375–1920 px).

### 7. Offene Fragen
- **keine** (alle Rückfragen aus dem früheren Stopp-Bericht wurden in PR #449 / `443-batch-all-slices.md` vollständig geklärt; PR #449 R1 bleibt gezielt für Slice 4 § 4.2 vorgemerkt).
