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
