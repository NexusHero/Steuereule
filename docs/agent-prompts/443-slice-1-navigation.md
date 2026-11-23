# Assignment: Ticket #443, Slice 1 — Navigation (tab stacks & a URL per screen)

You are working in the **SteuerEule** repo (pnpm monorepo, Expo + react-native-web, shipped only as a web app).
You implement **exactly one slice**: **Slice 1 from GitHub issue #443**. Afterwards a reviewer checks your work.
Read this assignment in full before you change any file. Follow it to the letter. If something is not stated here, do **not** decide it yourself; write it under "Open questions" in your final report.

---

## 0. Read first (mandatory, in this order)

1. `gh issue view 443` — only the sections **„Zielplattform“** (target platform), **„Beschlossene Entscheidungen“** (decisions taken; no. 13–15, 22) and **„Slice 1 — Navigation“**, plus **AC 1, AC 2, AC 3, AC 12**, are relevant to you.
2. `apps/mobile-web/App.tsx` in full (≈570 lines). This is the file you restructure.
3. `apps/mobile-web/App.test.tsx` in full. These tests must stay green.
4. `apps/mobile-web/src/screens/funnel/sessionMemory.ts` and `apps/mobile-web/src/screens/funnel/afterTheInterview.ts`.
5. `apps/mobile-web/src/screens/advisor/CopilotBridgeProvider.tsx`, only the props (`CopilotBridgeProviderProps`, around lines 113–119).
6. `packages/ui/src/components/TabBar.tsx` (props of `TabBar`).

---

## 1. Starting point (facts, do not re-check)

- In `TabbedShell` (`App.tsx`), `useState` `cockpitView` (19 values) and `profileView` (4 values) control which screen is visible. Screens have **no** URL.
- `changeTab()` calls `setProfileView('main')` and `setCockpitView('main')` on every tab change. This loses input and position.
- The root navigation (`RootStack`, `linking`) already exists with `@react-navigation/native` and `@react-navigation/native-stack` (both installed). `App` is on the path `app`; `Printout` on `app/steuerjahr/:year/ausdruck`, `Confirmation` on `app/steuerjahr/:year/bestaetigung`.
- `CopilotBridgeProvider` already wraps the tab shell (ticket #446 is merged). It receives `mode` (`'eulen-modus'` when the `eule` tab is active, otherwise `'cockpit'`) and `onModeChange`.
- The tax year is remembered in **sessionStorage** via `rememberedTaxYear` / `rememberTaxYear`.

---

## 2. Goal of Slice 1

1. Each tab (`cockpit`, `eule`, `belege`, `profil`) has its own navigator. A tab change **freezes** the state of the tab being left (no more resets).
2. Tapping the **active** tab again goes to the root of that tab (pop-to-root).
3. Every cockpit and profile screen has its own URL (table in section 4). Reload and browser back/forward lead to the same screen in the same tax year.
4. A guest who opens a URL that needs an account lands on the account wall and, after registration/login, on exactly this URL.
5. **The domain flow stays identical.** The existing tunnel (LStB → life situations → income → Sonderausgaben (special expenses) → workdays → plausibility → filing type comparison) keeps running exactly as before; every `setCockpitView('x')` is only replaced by a navigation to the route `x`. **Every `onDone` and `onBack` edge stays exactly the same** (same target, same `revisit` value).

---

## 3. What you must NOT do (hard rules)

- **No** hub cockpit, **no** booster tiles, **no** sheets/modals, **no** dark mode, **no** haptics. Those are later slices.
- **No** change in `packages/core`, `apps/api`, to DTOs or to ELSTER print templates.
- **No** change to screen components in `apps/mobile-web/src/screens/**`, unless a screen needs a prop that does not exist yet. In that case: only add the prop, do not change behavior, and justify it in the report.
- **Do not** rename or remove any `data-testid` / `testID`.
- **Do not** delete, weaken or disable existing tests with `.skip`. An existing test may only be adjusted if it checks the old internal structure (not the behavior); justify every adjustment in the report.
- **No personal data in URLs** (no name, no Steuer-ID (tax ID), no amounts). Allowed in URLs: tax year, screen name, `entry`, `area`, `revisit`.
- **No tax data in localStorage or sessionStorage.** The only thing allowed is a new sessionStorage note for the return URL (section 6).
- Identifiers, file names and comments **in English**. Visible UI text in German via i18n (you should not need any new UI text).
- No new dependencies except `@react-navigation/bottom-tabs` (section 5).

---

## 4. Route table (binding)

All paths sit **below** the existing root screen `App` (path `app`). Route names in English, URL segments in German.

**Tab `Cockpit` (stack `CockpitStack`)**

| Route | URL | Params | Component (as today in the `cockpitView` branch) |
| :--- | :--- | :--- | :--- |
| `CockpitHome` | `/app` | – | `CockpitScreen` |
| `Interview` | `/app/steuerjahr/:year/interview` | `year` | `InterviewScreen` |
| `AccountWall` | `/app/konto-wand` | – | `AccountWallScreen` |
| `Lstb` | `/app/steuerjahr/:year/lstb` | `year` | `LstbScreen` (without partner) |
| `Pension` | `/app/steuerjahr/:year/rente` | `year` | `PensionerScreen` |
| `CrossBorder` | `/app/steuerjahr/:year/schweiz` | `year` | `CrossBorderScreen` |
| `Catalog` | `/app/steuerjahr/:year/katalog/:entry` | `year`, `entry` ∈ `lebenslagen`/`einkuenfte`/`sonderausgaben`, optional `revisit` (query `?revisit=1`) | `CatalogScreen` |
| `Workdays` | `/app/steuerjahr/:year/arbeitstage` | `year` | `WorkdaysScreen` (without partner) |
| `Plausibility` | `/app/steuerjahr/:year/plausibilitaet` | `year` | `PlausibilityScreen` |
| `FilingTypeComparison` | `/app/steuerjahr/:year/veranlagungsvergleich` | `year` | `FilingTypeComparisonScreen` |
| `Assessment` | `/app/steuerjahr/:year/bescheid` | `year` | `AssessmentScreen` |
| `Capital` | `/app/steuerjahr/:year/kapital` | `year` | `CapitalScreen` |
| `Rental` | `/app/steuerjahr/:year/vermietung` | `year` | `RentalScreen` |
| `Children` | `/app/steuerjahr/:year/kinder` | `year` | `ChildrenScreen` |
| `CockpitMasterData` | `/app/steuerjahr/:year/stammdaten` | `year` | `MasterDataScreen` with `taxYear` and `onRecordPartner` |
| `Partner` | `/app/steuerjahr/:year/partner/:area` | `year`, `area` ∈ `lstb`/`arbeitsweg` | `LstbScreen` or `WorkdaysScreen` with `partnerName` |

**Tab `Eule`**: one route `Owl`, URL `/app/eule`, component `OwlModeScreen` (props as today).

**Tab `Belege`**: one route `Receipts`, URL `/app/belege`, component `ReceiptsScreen`.

**Tab `Profil` (stack `ProfileStack`)**

| Route | URL | Component |
| :--- | :--- | :--- |
| `ProfileHome` | `/app/profil` | `ProfileScreen` |
| `Privacy` | `/app/profil/datenschutz` | `PrivacyScreen` |
| `Security` | `/app/profil/sicherheit` | `SecurityScreen` |
| `ProfileMasterData` | `/app/profil/stammdaten` | `MasterDataScreen` (without `taxYear`, as today) |

**Special cases:**
- **`Partner`:** The partner name must **not** go into the URL. Keep it in shell state (section 5). If it is missing (e.g. after a reload), replace the route with `CockpitMasterData` with the same year.
- **`year` parameter:** If `year` is in `SELECTABLE_TAX_YEARS` and differs from the current tax year, set the tax year to `year` (via the same function as today's `setTaxYear`). If `year` is not a selectable number, replace the route with `CockpitHome`. When you navigate to a screen in code, always pass `year: taxYear`.
- **`App` param `start: 'interview'`** (from login/guest): on the first render, navigate to the route `Interview` with the current year. Do not change the param type in `RootStackParamList`.
- `/app/steuerjahr/:year/ausdruck` and `/app/steuerjahr/:year/bestaetigung` must continue to open the root screens `Printout` and `Confirmation` respectively.

---

## 5. Implementation (step by step)

Work through the steps **in order**. After each step: `pnpm --filter @steuereule/mobile-web typecheck` must be green before you continue.

**Step 1 — Branch.**
```bash
git fetch origin && git switch -c feat/443-slice-1-navigation origin/main
```
Work only on this branch. Do not push and do not open a PR; the reviewer does that.

**Step 2 — Dependency.**
```bash
pnpm --filter @steuereule/mobile-web add @react-navigation/bottom-tabs@^7
```
Check that the installed major version matches `@react-navigation/native` (7.x).

**Step 3 — Create new files** in `apps/mobile-web/src/navigation/`:
- `routes.ts` — types only: `CockpitStackParamList`, `ProfileStackParamList`, `AppTabParamList` (`Cockpit`, `Owl`, `Receipts`, `Profile` with `NavigatorScreenParams`). Parameters exactly as in the table in section 4; `year` as `number`.
- `linking.ts` — the complete `LinkingOptions<RootStackParamList>`. Move the existing `linking` constant from `App.tsx` here and add the nested `screens` from section 4 under `App`. For `year` a `parse` entry (`Number`), for `revisit` `parse: (v) => v === '1'` and `stringify: (v) => (v ? '1' : '')`.
- `ShellState.tsx` — React context for the state that lives in `TabbedShell` today and is needed by several screens: `taxYear`/`setTaxYear` (incl. `rememberTaxYear`), `funnelPath`/`setFunnelPath`, `pendingPath`/`setPendingPath`, `partner` (`{ area, name } | null`) / `setPartner`. Plus a hook `useShellState()` that throws if the provider is missing.
- `CockpitStack.tsx` — `createNativeStackNavigator<CockpitStackParamList>()` with `headerShown: false` and all cockpit routes. Each route is a small wrapper component that reads `navigation`/`route` and renders the screen component **with the same props as today**. Replace every `setCockpitView('x')` with `navigation.navigate('<Route>', { year: taxYear, ... })`. For the backward edges (`onBack`) also use `navigate` with today's target, **not** `goBack()`, so the target stays exactly the same.
- `ProfileStack.tsx` — likewise for the profile routes; replace `setProfileView(...)`.
- `AppTabs.tsx` — `createBottomTabNavigator<AppTabParamList>()` with `headerShown: false` and its **own** `tabBar` function that renders the existing Funke `TabBar` from `@steuereule/ui` (tabs, icons and labels exactly as today in `TabbedShell`). In this `tabBar` function:
  - On tap: `navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })`. If the tab is **already active** and not prevented → navigate to the tab's root route (`CockpitHome` or `ProfileHome`). Otherwise `navigation.navigate(route.name)`.
  - The TabBar is hidden when a route other than `ProfileHome` is active in the `Profile` tab (as today with `showsTabBar`). Otherwise visible.
  - The content gets room at the bottom for the floating TabBar as today (`tabBarClearance(t, insets.bottom)`), but only when the TabBar is visible. Background `t.color.grund`.

**Step 4 — Restructure `App.tsx`.**
- `TabbedShell` renders: `ShellStateProvider` → `CopilotBridgeProvider` → `AppTabs`.
- `CopilotBridgeProvider` gets `mode="eulen-modus"` when the focused tab is `Owl`, otherwise `"cockpit"`. `onModeChange` navigates to the tab `Owl` or `Cockpit` (instead of `changeTab`). The other props (`taxYear`, `isAuthenticated`) as today.
- The two `useEffect`s for `pendingPath` and `rememberedPendingPath` keep the same content; instead of `setCockpitView(view)` they navigate: `'konto-wand'` → `AccountWall`, `'rente'` → `Pension`, `'ch'` → `CrossBorder`, `'lstb'` → `Lstb` (with `year: taxYear`).
- `changeTab`, `cockpitView`, `profileView`, `catalogRevisit`, `partnerScreen` as `useState` are removed entirely.
- `onSignedOut` stays (clear the query cache, `navigation.replace('Login')`).
- `NavigationContainer` gets `linking` from `src/navigation/linking.ts`.
- `App.tsx` should be considerably shorter afterwards. Goal: no file over ~300 lines; rather split further.

**Step 5 — Guest deep link (AC 3).**
- In `sessionMemory.ts` add two functions, in the same style as the existing ones: `rememberReturnTo(path: string | null)` and `rememberedReturnTo(): string | null`, key `steuereule.returnTo`. Only store paths that start with `/app/`; ignore everything else.
- Not wrapped (behavior stays as today): `CockpitHome`, `Interview`, `AccountWall`, the `Owl` tab (it has its own guest gate) and the `Receipts` tab. **All other cockpit and profile routes need an account.**
- Build a small component `RequiresAccount` (in `src/navigation/`) that wraps the account-required wrappers:
  - `useAccountSession().state.status === 'loading'` → render nothing.
  - `'signed-out'` → remember the current URL path (`rememberReturnTo`) and replace the route with `AccountWall`.
  - `'signed-in'` → render children.
- After signing in (the existing `useEffect` on `sessionState.status === 'signed-in'`): if there is a `rememberedReturnTo()`, delete the note and navigate there (`useLinkTo()` from `@react-navigation/native`). This return URL takes **precedence** over `rememberedPendingPath`.

**Step 6 — Add tests** in `apps/mobile-web/App.test.tsx` (same style as the existing ones, React Testing Library + MSW). At least these cases, test names in English:
1. *AC 1:* In the cockpit open `Lstb`, type a value into `lstb-bruttoarbeitslohn` (do not leave the field), switch to the Belege (documents) tab, back to the cockpit → the LStB screen is visible and the field contains the typed value.
2. *Pop-to-root:* In the cockpit open `Lstb`, tap the cockpit tab again → `CockpitScreen` is visible.
3. *AC 2:* Direct call `/app/steuerjahr/2025/lstb` (signed in) → LStB screen for 2025.
4. *AC 2:* Direct call `/app/steuerjahr/2025/katalog/einkuenfte` → catalog with the income entry.
5. *Year:* Direct call `/app/steuerjahr/1999/lstb` → cockpit.
6. *Partner after reload:* Direct call `/app/steuerjahr/2025/partner/lstb` without partner state → master data screen.
7. *AC 3:* As a guest open `/app/steuerjahr/2025/kapital` → account wall; `sessionStorage['steuereule.returnTo']` is `/app/steuerjahr/2025/kapital`.
8. *AC 3:* Then simulate a sign-in (as in the existing login tests) → the capital screen is visible, the note is deleted.
9. *Tunnel unchanged:* LStB `onDone` → catalog life situations; its `onDone` → catalog income; its `onBack` → life situations with `revisit`.
10. `/app/steuerjahr/2025/ausdruck` still opens `Printout`.

Write each new test **first**, see it red, then implement (if the implementation already exists: briefly introduce the bug on purpose to prove the test catches it, and take it out again).

**Step 7 — E2E scenarios.**
- Run all 24 scenarios (section 7). If a scenario turns red, **first check whether the app is wrong** (then fix the app). Only if the scenario relies on old internal flows (e.g. that a tab change resets the screen), adjust the scenario and justify that in the report.
- In `e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`, add a block at the end: open a screen via a URL, `page.reload()`, check that the same screen is visible; check `page.goBack()`.

---

## 6. Acceptance criteria for this slice

- **AC 1:** Input and the open screen survive a tab change.
- **AC 2:** Every screen from section 4 has its URL; reload and browser back/forward lead to the same screen in the same year.
- **AC 3:** Guest deep link → account wall → after sign-in exactly this screen.
- **Pop-to-root** works for cockpit and profile.
- **Domain flow unchanged:** every `onDone`/`onBack` edge as before.
- **AC 12:** all 24 E2E scenarios green.

---

## 7. Check commands (all must be green before you report done)

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

The E2E commands start the stack themselves (BOOT mode). If the stack does not start locally (e.g. Docker/Postgres missing), **do not guess or skip**: write the exact error message into the report.

---

## 8. Commits

- Small commits, at least one per step, format `feat(navigation): …` / `test(navigation): …` / `refactor(navigation): …` (in English).
- No commit with a red typecheck or red unit tests.

---

## 9. Final report (exactly this structure)

1. **Changed and new files** — list with one sentence each on what is in it.
2. **Deviations from this assignment** — each one individually with justification. No deviation → "none".
3. **Adjusted existing tests/scenarios** — which ones, why.
4. **Result of each check command from section 7** — green/red, for red the output.
5. **Open questions** — everything you were not allowed to decide.

Only report done when everything from section 7 is green, or you state exactly in the report what did not run and why.
