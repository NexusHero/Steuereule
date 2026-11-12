# Auftrag: Ticket #443, Slice 1 — Navigation (Tab-Stacks & URL pro Maske)

Du arbeitest im Repo **SteuerEule** (pnpm-Monorepo, Expo + react-native-web, ausgeliefert nur als Web-App).
Du setzt **genau einen Slice** um: **Slice 1 aus GitHub-Issue #443**. Danach wird deine Arbeit von einem Reviewer geprüft.
Lies diesen Auftrag vollständig, bevor du eine Datei änderst. Halte dich wörtlich daran. Wenn etwas hier nicht steht, entscheide **nicht** selbst, sondern schreib es unter „Offene Fragen“ in deinen Abschlussbericht.

---

## 0. Zuerst lesen (Pflicht, in dieser Reihenfolge)

1. `gh issue view 443` — nur die Abschnitte **„Zielplattform“**, **„Beschlossene Entscheidungen“** (Nr. 13–15, 22) und **„Slice 1 — Navigation“** sowie **AC 1, AC 2, AC 3, AC 12** sind für dich relevant.
2. `apps/mobile-web/App.tsx` komplett (≈570 Zeilen). Das ist die Datei, die du umbaust.
3. `apps/mobile-web/App.test.tsx` komplett. Diese Tests müssen grün bleiben.
4. `apps/mobile-web/src/screens/funnel/sessionMemory.ts` und `apps/mobile-web/src/screens/funnel/afterTheInterview.ts`.
5. `apps/mobile-web/src/screens/advisor/CopilotBridgeProvider.tsx`, nur die Props (`CopilotBridgeProviderProps`, ca. Zeile 113–119).
6. `packages/ui/src/components/TabBar.tsx` (Props von `TabBar`).

---

## 1. Ausgangslage (Fakten, nicht neu prüfen)

- In `TabbedShell` (`App.tsx`) steuert `useState` `cockpitView` (19 Werte) und `profileView` (4 Werte), welcher Screen sichtbar ist. Masken haben **keine** URL.
- `changeTab()` setzt bei jedem Tab-Wechsel `setProfileView('main')` und `setCockpitView('main')`. Dadurch gehen Eingaben und Position verloren.
- Die Root-Navigation (`RootStack`, `linking`) existiert schon mit `@react-navigation/native` und `@react-navigation/native-stack` (beide installiert). `App` liegt auf dem Pfad `app`; `Printout` auf `app/steuerjahr/:year/ausdruck`, `Confirmation` auf `app/steuerjahr/:year/bestaetigung`.
- `CopilotBridgeProvider` umschließt die Tab-Shell bereits (Ticket #446 ist gemerged). Er bekommt `mode` (`'eulen-modus'` wenn Tab `eule` aktiv, sonst `'cockpit'`) und `onModeChange`.
- Das Steuerjahr wird über `rememberedTaxYear` / `rememberTaxYear` in **sessionStorage** gemerkt.

---

## 2. Ziel von Slice 1

1. Jeder Tab (`cockpit`, `eule`, `belege`, `profil`) hat einen eigenen Navigator. Ein Tab-Wechsel **friert** den Zustand des verlassenen Tabs ein (keine Resets mehr).
2. Erneutes Antippen des **aktiven** Tabs führt zur Wurzel dieses Tabs (Pop-to-Root).
3. Jede Cockpit- und Profil-Maske hat eine eigene URL (Tabelle in Abschnitt 4). Reload und Browser-Zurück/-Vor führen zur selben Maske im selben Steuerjahr.
4. Ein Gast, der eine URL öffnet, die ein Konto braucht, landet an der Konto-Wand und nach Registrierung/Login genau auf dieser URL.
5. **Der fachliche Ablauf bleibt identisch.** Der bisherige Tunnel (LStB → Lebenslagen → Einkünfte → Sonderausgaben → Arbeitstage → Plausibilität → Veranlagungsvergleich) läuft weiter genauso; jedes `setCockpitView('x')` wird nur durch eine Navigation zur Route `x` ersetzt. **Jede `onDone`- und `onBack`-Kante bleibt exakt gleich** (gleiches Ziel, gleicher `revisit`-Wert).

---

## 3. Was du NICHT tun darfst (harte Regeln)

- **Kein** Hub-Cockpit, **keine** Booster-Kacheln, **keine** Sheets/Modals, **kein** Dark Mode, **keine** Haptik. Das sind spätere Slices.
- **Keine** Änderung in `packages/core`, `apps/api`, an DTOs oder ELSTER-Druckschablonen.
- **Keine** Änderung an Screen-Komponenten in `apps/mobile-web/src/screens/**`, außer wenn ein Screen eine Prop braucht, die es noch nicht gibt. Dann: nur die Prop ergänzen, Verhalten nicht ändern, und im Bericht begründen.
- **Kein** `data-testid` / `testID` umbenennen oder entfernen.
- **Keine** bestehenden Tests löschen, abschwächen oder mit `.skip` deaktivieren. Ein bestehender Test darf nur angepasst werden, wenn er die alte interne Struktur prüft (nicht das Verhalten); begründe jede Anpassung im Bericht.
- **Keine personenbezogenen Daten in URLs** (kein Name, keine Steuer-ID, keine Beträge). Erlaubt in URLs: Steuerjahr, Maskenname, `entry`, `area`, `revisit`.
- **Keine Steuerdaten in localStorage oder sessionStorage.** Erlaubt ist nur eine neue sessionStorage-Notiz für die Rücksprung-URL (Abschnitt 6).
- Bezeichner, Dateinamen und Kommentare **auf Englisch**. Sichtbare UI-Texte auf Deutsch über i18n (du solltest keine neuen UI-Texte brauchen).
- Keine neuen Abhängigkeiten außer `@react-navigation/bottom-tabs` (Abschnitt 5).

---

## 4. Routen-Tabelle (verbindlich)

Alle Pfade liegen **unter** dem vorhandenen Root-Screen `App` (Pfad `app`). Routennamen auf Englisch, URL-Segmente auf Deutsch.

**Tab `Cockpit` (Stack `CockpitStack`)**

| Route | URL | Params | Komponente (wie heute im `cockpitView`-Zweig) |
| :--- | :--- | :--- | :--- |
| `CockpitHome` | `/app` | – | `CockpitScreen` |
| `Interview` | `/app/steuerjahr/:year/interview` | `year` | `InterviewScreen` |
| `AccountWall` | `/app/konto-wand` | – | `AccountWallScreen` |
| `Lstb` | `/app/steuerjahr/:year/lstb` | `year` | `LstbScreen` (ohne Partner) |
| `Pension` | `/app/steuerjahr/:year/rente` | `year` | `PensionerScreen` |
| `CrossBorder` | `/app/steuerjahr/:year/schweiz` | `year` | `CrossBorderScreen` |
| `Catalog` | `/app/steuerjahr/:year/katalog/:entry` | `year`, `entry` ∈ `lebenslagen`/`einkuenfte`/`sonderausgaben`, optional `revisit` (Query `?revisit=1`) | `CatalogScreen` |
| `Workdays` | `/app/steuerjahr/:year/arbeitstage` | `year` | `WorkdaysScreen` (ohne Partner) |
| `Plausibility` | `/app/steuerjahr/:year/plausibilitaet` | `year` | `PlausibilityScreen` |
| `FilingTypeComparison` | `/app/steuerjahr/:year/veranlagungsvergleich` | `year` | `FilingTypeComparisonScreen` |
| `Assessment` | `/app/steuerjahr/:year/bescheid` | `year` | `AssessmentScreen` |
| `Capital` | `/app/steuerjahr/:year/kapital` | `year` | `CapitalScreen` |
| `Rental` | `/app/steuerjahr/:year/vermietung` | `year` | `RentalScreen` |
| `Children` | `/app/steuerjahr/:year/kinder` | `year` | `ChildrenScreen` |
| `CockpitMasterData` | `/app/steuerjahr/:year/stammdaten` | `year` | `MasterDataScreen` mit `taxYear` und `onRecordPartner` |
| `Partner` | `/app/steuerjahr/:year/partner/:area` | `year`, `area` ∈ `lstb`/`arbeitsweg` | `LstbScreen` bzw. `WorkdaysScreen` mit `partnerName` |

**Tab `Eule`**: eine Route `Owl`, URL `/app/eule`, Komponente `OwlModeScreen` (Props wie heute).

**Tab `Belege`**: eine Route `Receipts`, URL `/app/belege`, Komponente `ReceiptsScreen`.

**Tab `Profil` (Stack `ProfileStack`)**

| Route | URL | Komponente |
| :--- | :--- | :--- |
| `ProfileHome` | `/app/profil` | `ProfileScreen` |
| `Privacy` | `/app/profil/datenschutz` | `PrivacyScreen` |
| `Security` | `/app/profil/sicherheit` | `SecurityScreen` |
| `ProfileMasterData` | `/app/profil/stammdaten` | `MasterDataScreen` (ohne `taxYear`, wie heute) |

**Sonderfälle:**
- **`Partner`:** Der Partnername darf **nicht** in die URL. Halte ihn im Shell-State (Abschnitt 5). Fehlt er (z. B. nach Reload), ersetze die Route durch `CockpitMasterData` mit demselben Jahr.
- **`year`-Parameter:** Ist `year` in `SELECTABLE_TAX_YEARS` und ungleich dem aktuellen Steuerjahr, setze das Steuerjahr auf `year` (über dieselbe Funktion wie heute `setTaxYear`). Ist `year` keine wählbare Zahl, ersetze die Route durch `CockpitHome`. Navigierst du im Code zu einer Maske, übergib immer `year: taxYear`.
- **`App`-Param `start: 'interview'`** (von Login/Gast): Beim ersten Rendern zur Route `Interview` mit dem aktuellen Jahr navigieren. Den Param-Typ in `RootStackParamList` nicht ändern.
- `/app/steuerjahr/:year/ausdruck` und `/app/steuerjahr/:year/bestaetigung` müssen weiterhin die Root-Screens `Printout` bzw. `Confirmation` öffnen.

---

## 5. Umsetzung (Schritt für Schritt)

Arbeite die Schritte **der Reihe nach** ab. Nach jedem Schritt: `pnpm --filter @steuereule/mobile-web typecheck` muss grün sein, bevor du weitermachst.

**Schritt 1 — Branch.**
```bash
git fetch origin && git switch -c feat/443-slice-1-navigation origin/main
```
Arbeite nur auf diesem Branch. Pushe nicht und öffne keinen PR, das macht der Reviewer.

**Schritt 2 — Abhängigkeit.**
```bash
pnpm --filter @steuereule/mobile-web add @react-navigation/bottom-tabs@^7
```
Prüfe, dass die installierte Hauptversion zu `@react-navigation/native` (7.x) passt.

**Schritt 3 — Neue Dateien anlegen** in `apps/mobile-web/src/navigation/`:
- `routes.ts` — nur Typen: `CockpitStackParamList`, `ProfileStackParamList`, `AppTabParamList` (`Cockpit`, `Owl`, `Receipts`, `Profile` mit `NavigatorScreenParams`). Parameter genau wie Tabelle in Abschnitt 4; `year` als `number`.
- `linking.ts` — die vollständige `LinkingOptions<RootStackParamList>`. Verschiebe die bestehende `linking`-Konstante aus `App.tsx` hierher und ergänze unter `App` die verschachtelten `screens` aus Abschnitt 4. Für `year` einen `parse`-Eintrag (`Number`), für `revisit` `parse: (v) => v === '1'` und `stringify: (v) => (v ? '1' : '')`.
- `ShellState.tsx` — React-Context für den Zustand, der heute in `TabbedShell` lebt und von mehreren Screens gebraucht wird: `taxYear`/`setTaxYear` (inkl. `rememberTaxYear`), `funnelPath`/`setFunnelPath`, `pendingPath`/`setPendingPath`, `partner` (`{ area, name } | null`) / `setPartner`. Plus Hook `useShellState()`, der wirft, wenn der Provider fehlt.
- `CockpitStack.tsx` — `createNativeStackNavigator<CockpitStackParamList>()` mit `headerShown: false` und allen Cockpit-Routen. Jede Route ist eine kleine Wrapper-Komponente, die `navigation`/`route` liest und die Screen-Komponente **mit denselben Props wie heute** rendert. Ersetze jedes `setCockpitView('x')` durch `navigation.navigate('<Route>', { year: taxYear, ... })`. Bei den Rückwärts-Kanten (`onBack`) ebenfalls `navigate` mit dem Ziel von heute verwenden, **nicht** `goBack()`, damit das Ziel exakt gleich bleibt.
- `ProfileStack.tsx` — analog für die Profil-Routen; ersetze `setProfileView(...)`.
- `AppTabs.tsx` — `createBottomTabNavigator<AppTabParamList>()` mit `headerShown: false` und einer **eigenen** `tabBar`-Funktion, die die vorhandene Funke-`TabBar` aus `@steuereule/ui` rendert (Tabs, Icons und Labels genau wie heute in `TabbedShell`). In dieser `tabBar`-Funktion:
  - Beim Tippen: `navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })`. Ist der Tab **schon aktiv** und nicht prevented → zur Wurzelroute des Tabs navigieren (`CockpitHome` bzw. `ProfileHome`). Sonst `navigation.navigate(route.name)`.
  - Die TabBar ist ausgeblendet, wenn im Tab `Profile` eine andere Route als `ProfileHome` aktiv ist (wie heute `showsTabBar`). Sonst sichtbar.
  - Der Inhalt bekommt unten Platz für die schwebende TabBar wie heute (`tabBarClearance(t, insets.bottom)`), aber nur, wenn die TabBar sichtbar ist. Hintergrund `t.color.grund`.

**Schritt 4 — `App.tsx` umbauen.**
- `TabbedShell` rendert: `ShellStateProvider` → `CopilotBridgeProvider` → `AppTabs`.
- `CopilotBridgeProvider` bekommt `mode="eulen-modus"`, wenn der fokussierte Tab `Owl` ist, sonst `"cockpit"`. `onModeChange` navigiert zum Tab `Owl` bzw. `Cockpit` (statt `changeTab`). Die übrigen Props (`taxYear`, `isAuthenticated`) wie heute.
- Die beiden `useEffect`s für `pendingPath` und `rememberedPendingPath` bleiben inhaltlich gleich; statt `setCockpitView(view)` navigieren sie: `'konto-wand'` → `AccountWall`, `'rente'` → `Pension`, `'ch'` → `CrossBorder`, `'lstb'` → `Lstb` (mit `year: taxYear`).
- `changeTab`, `cockpitView`, `profileView`, `catalogRevisit`, `partnerScreen` als `useState` entfallen vollständig.
- `onSignedOut` bleibt (Query-Cache leeren, `navigation.replace('Login')`).
- `NavigationContainer` bekommt `linking` aus `src/navigation/linking.ts`.
- `App.tsx` soll danach deutlich kürzer sein. Ziel: keine Datei über ~300 Zeilen; teile lieber weiter auf.

**Schritt 5 — Gast-Deep-Link (AC 3).**
- In `sessionMemory.ts` zwei Funktionen ergänzen, im selben Stil wie die vorhandenen: `rememberReturnTo(path: string | null)` und `rememberedReturnTo(): string | null`, Key `steuereule.returnTo`. Nur Pfade speichern, die mit `/app/` beginnen; alles andere ignorieren.
- Nicht umschlossen werden (Verhalten bleibt wie heute): `CockpitHome`, `Interview`, `AccountWall`, der Tab `Owl` (er hat ein eigenes Gast-Gate) und der Tab `Receipts`. **Alle anderen Cockpit- und Profil-Routen brauchen ein Konto.**
- Baue eine kleine Komponente `RequiresAccount` (in `src/navigation/`), die die konto-pflichtigen Wrapper umschließt:
  - `useAccountSession().state.status === 'loading'` → nichts rendern.
  - `'signed-out'` → aktuelle URL-Pfad merken (`rememberReturnTo`) und Route durch `AccountWall` ersetzen.
  - `'signed-in'` → Kinder rendern.
- Nach dem Anmelden (der vorhandene `useEffect` auf `sessionState.status === 'signed-in'`): Gibt es `rememberedReturnTo()`, Notiz löschen und dorthin navigieren (`useLinkTo()` aus `@react-navigation/native`). Diese Rücksprung-URL hat **Vorrang** vor `rememberedPendingPath`.

**Schritt 6 — Tests ergänzen** in `apps/mobile-web/App.test.tsx` (gleicher Stil wie die vorhandenen, React Testing Library + MSW). Mindestens diese Fälle, Testnamen auf Englisch:
1. *AC 1:* Im Cockpit `Lstb` öffnen, in `lstb-bruttoarbeitslohn` einen Wert tippen (Feld nicht verlassen), zum Tab Belege wechseln, zurück zum Cockpit → LStB-Maske ist sichtbar und das Feld enthält den getippten Wert.
2. *Pop-to-Root:* Im Cockpit `Lstb` öffnen, erneut auf den Cockpit-Tab tippen → `CockpitScreen` ist sichtbar.
3. *AC 2:* Direktaufruf `/app/steuerjahr/2025/lstb` (eingeloggt) → LStB-Maske für 2025.
4. *AC 2:* Direktaufruf `/app/steuerjahr/2025/katalog/einkuenfte` → Katalog mit Eintrag Einkünfte.
5. *Jahr:* Direktaufruf `/app/steuerjahr/1999/lstb` → Cockpit.
6. *Partner nach Reload:* Direktaufruf `/app/steuerjahr/2025/partner/lstb` ohne Partner-State → Stammdaten-Maske.
7. *AC 3:* Als Gast `/app/steuerjahr/2025/kapital` öffnen → Konto-Wand; `sessionStorage['steuereule.returnTo']` ist `/app/steuerjahr/2025/kapital`.
8. *AC 3:* Danach Anmeldung simulieren (wie in den vorhandenen Login-Tests) → Kapital-Maske ist sichtbar, Notiz ist gelöscht.
9. *Tunnel unverändert:* LStB `onDone` → Katalog Lebenslagen; dessen `onDone` → Katalog Einkünfte; dessen `onBack` → Lebenslagen mit `revisit`.
10. `/app/steuerjahr/2025/ausdruck` öffnet weiterhin `Printout`.

Schreibe jeden neuen Test **zuerst**, sieh ihn rot, dann implementiere (falls die Implementierung schon steht: bau den Fehler kurz absichtlich ein, um zu beweisen, dass der Test ihn fängt, und nimm ihn wieder raus).

**Schritt 7 — E2E-Szenarien.**
- Alle 24 Szenarien laufen lassen (Abschnitt 7). Wenn ein Szenario rot wird, **zuerst prüfen, ob die App falsch ist** (dann App fixen). Nur wenn das Szenario sich auf alte interne Abläufe verlässt (z. B. dass ein Tab-Wechsel die Maske zurücksetzt), das Szenario anpassen und das im Bericht begründen.
- Ergänze in `e2e/scenarios/08-navigation-gast-und-alle-screens.mjs` am Ende einen Block: eine Maske über eine URL öffnen, `page.reload()`, prüfen, dass dieselbe Maske sichtbar ist; `page.goBack()` prüfen.

---

## 6. Akzeptanzkriterien für diesen Slice

- **AC 1:** Eingaben und offene Maske überleben einen Tab-Wechsel.
- **AC 2:** Jede Maske aus Abschnitt 4 hat ihre URL; Reload und Browser-Zurück/-Vor führen zur selben Maske im selben Jahr.
- **AC 3:** Gast-Deep-Link → Konto-Wand → nach Anmeldung genau diese Maske.
- **Pop-to-Root** funktioniert für Cockpit und Profil.
- **Fachlicher Ablauf unverändert:** jede `onDone`/`onBack`-Kante wie vorher.
- **AC 12:** alle 24 E2E-Szenarien grün.

---

## 7. Prüfbefehle (alle müssen grün sein, bevor du fertig meldest)

```bash
pnpm lint
```
```bash
pnpm -r typecheck
```
```bash
pnpm --filter @steuereule/mobile-web test
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

Die E2E-Befehle starten den Stack selbst (BOOT-Modus). Wenn der Stack lokal nicht startet (z. B. Docker/Postgres fehlt), **nicht raten oder überspringen**: schreib die genaue Fehlermeldung in den Bericht.

---

## 8. Commits

- Kleine Commits, je Schritt mindestens einer, Format `feat(navigation): …` / `test(navigation): …` / `refactor(navigation): …` (auf Englisch).
- Kein Commit mit rotem Typecheck oder roten Unit-Tests.

---

## 9. Abschlussbericht (genau diese Gliederung)

1. **Geänderte und neue Dateien** — Liste mit je einem Satz, was drin ist.
2. **Abweichungen von diesem Auftrag** — jede einzeln mit Begründung. Keine Abweichung → „keine“.
3. **Angepasste bestehende Tests/Szenarien** — welche, warum.
4. **Ergebnis jedes Prüfbefehls aus Abschnitt 7** — grün/rot, bei rot die Ausgabe.
5. **Offene Fragen** — alles, was du nicht entscheiden durftest.

Melde nur fertig, wenn alles aus Abschnitt 7 grün ist oder du im Bericht genau sagst, was nicht lief und warum.
