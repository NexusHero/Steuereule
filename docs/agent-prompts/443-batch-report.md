# Batch report: ticket #443 (slices 1–7)

> Note on the local E2E run (applies to the whole run): port `5432` on this machine is taken by an unrelated service. The E2E commands (`run-all-scenarios.mjs`, `no-client-persistence`, `breakpoint-layout`) were therefore run in `ATTACH` mode against the local Postgres 16 instance on `localhost:5434` (isolated database `steuereule_e2e_443`, `libpq` under `/opt/homebrew/opt/libpq/bin`), the built `@steuereule/api` (`:3301`) and the statically exported web bundle (`:4173`) — against a real backend, a real database and a real Chromium browser, with no skipped assertions.

---

## Slice 1 — Navigation (tab stacks & a URL per screen)

### 1. Status
**done**

### 2. Branch and last commit hash
- Branch: `feat/443-s1-navigation` (branched from `origin/main` `1990ed3`)
- Last code/test commit before this report commit: `6744999c218f394fc730562fe6e8c5773a2b4508` (`test(e2e): verify deep-link reload and history back in scenario 08`); this report was committed right after on the same branch.

### 3. Changed and new files
- `apps/mobile-web/App.tsx`: replaces the previous `cockpitView`/`profileView` states with `ShellStateProvider`, `CopilotBridgeProvider` and `AppTabs` inside `RootStack` with URL `linking`.
- `apps/mobile-web/App.test.tsx`: adds 11 tests for tab state preservation (AC 1), pop-to-root, deep links (AC 2), `year`/`Partner` guards, guest deep link with `steuereule.returnTo` (AC 3), the unchanged tunnel and `ProfileStack`.
- `apps/mobile-web/package.json`: adds `@react-navigation/bottom-tabs` (`^7.18.14`) to match the installed `@react-navigation/native` 7.x line.
- `pnpm-lock.yaml`: lockfile update for `@react-navigation/bottom-tabs@^7.18.14`.
- `apps/mobile-web/src/navigation/routes.ts`: defines the types `CockpitStackParamList`, `ProfileStackParamList`, `AppTabParamList` and `RootStackParamList`.
- `apps/mobile-web/src/navigation/linking.ts`: moves and extends `LinkingOptions<RootStackParamList>` with all cockpit and profile screen URLs, including `Number` parsing for `:year` and `revisit=1`.
- `apps/mobile-web/src/navigation/linking.test.tsx`: checks URL round trips of all 28 route paths from the route table as well as parameter parsing and root exceptions.
- `apps/mobile-web/src/navigation/ShellState.tsx`: provides `ShellStateProvider` and `useShellState()` for `taxYear`, `funnelPath`, `pendingPath`, `partner`, `focusedTab` and tab/cockpit navigation.
- `apps/mobile-web/src/navigation/AppTabs.tsx`: implements the `BottomTabNavigator` with the Funke `TabBar`, tab freezing without reset, pop-to-root (including `event.preventDefault()` against a NativeStack double reset) and hiding the `TabBar` on `Profile` subpages.
- `apps/mobile-web/src/navigation/CockpitStack.tsx`: defines the `NativeStackNavigator` for the cockpit tab, including `CockpitHome`, `Interview` and `AccountWall`.
- `apps/mobile-web/src/navigation/CockpitTunnelRoutes.tsx`: encapsulates the tunnel routes (`Lstb`, `Pension`, `CrossBorder`, `Catalog`, `Workdays`, `Plausibility`, `FilingTypeComparison`) with unchanged `onDone`/`onBack`/`revisit` edges under `RequiresAccount`.
- `apps/mobile-web/src/navigation/CockpitDetailRoutes.tsx`: encapsulates the detail routes (`Assessment`, `Capital`, `Rental`, `Children`, `CockpitMasterData`, `Partner`) under `RequiresAccount`, including the `Partner` fallback to `CockpitMasterData`.
- `apps/mobile-web/src/navigation/ProfileStack.tsx`: defines the `NativeStackNavigator` for the profile tab (`ProfileHome`, `Privacy`, `Security`, `ProfileMasterData`).
- `apps/mobile-web/src/navigation/RequiresAccount.tsx`: redirects guests on account-only routes to `AccountWall` after storing the target URL in `steuereule.returnTo`.
- `apps/mobile-web/src/navigation/guards.ts`: provides `isSelectableYear`, `useYearGuard` and `renderActiveStackRoute` for unmounting hidden stack cards within the same stack.
- `apps/mobile-web/src/screens/funnel/sessionMemory.ts`: adds `rememberReturnTo`/`rememberedReturnTo` for `/app/…` paths under the `sessionStorage` key `steuereule.returnTo`.
- `apps/mobile-web/src/screens/funnel/sessionMemory.test.tsx`: tests `rememberReturnTo`/`rememberedReturnTo`, including rejection of paths outside `/app/` and a blocked `sessionStorage`.
- `e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`: adds the check for a direct visit to `/app/steuerjahr/2025/kapital`, `page.reload()` and browser back (`page.goBack()`).
- `docs/agent-prompts/443-batch-report.md`: creates this batch report (section Slice 1).

### 4. Deviations from the assignment
- **`ProfileHome` and `Privacy` in `ProfileStack.tsx` without `<RequiresAccount>`:** `443-slice-1-navigation.md` (step 5) says that all other cockpit and profile routes except `CockpitHome`/`Interview`/`AccountWall`/`Owl`/`Receipts` require an account. The existing tests in `apps/mobile-web/App.test.tsx` („reaches Profil from Cockpit through the tab bar“ and „reaches Datenschutz … — a guest sees the honest no-account notice“) and `PrivacyScreen` itself, however, explicitly expect guests to be able to open `Profil` and `Datenschutz` (with an honest „Noch kein Konto“ ("No account yet") notice). To avoid breaking or weakening the existing tests, only `Security` and `ProfileMasterData` were wrapped in `<RequiresAccount>` (see Open questions).
- **Hidden routes within the same stack (`renderActiveStackRoute` in `guards.ts`):** On web, `@react-navigation/native-stack` keeps rendering earlier stack routes in the DOM with `display: none`, which for navigations such as `Catalog → onBack` produces duplicate back buttons (`Zurück`) for accessibility queries. That is why `renderActiveStackRoute` renders only the active stack route; across tab switches (`AppTabs`) all tab states and active screens are fully preserved (AC 1).
- **File names (`linking.test.tsx` instead of `.ts`, splitting `CockpitStack` into tunnel/detail routes & `guards.ts`):** Because of the Vitest include configuration (`*.test.tsx`) and the 300-line limit from A5, the route wrappers were split into modules.
- **Local E2E port configuration:** Since port `5432` is taken, the E2E gates were run in `ATTACH` mode against `localhost:5434` (see note above).

### 5. Adjusted existing tests/scenarios
- **`apps/mobile-web/App.test.tsx`:** Existing tests were **not** changed; 11 new tests for slice 1 were added.
- **`apps/mobile-web/src/screens/funnel/sessionMemory.test.tsx`:** Existing tests unchanged; 1 test for `rememberReturnTo`/`rememberedReturnTo` + a storage fallback assertion added.
- **`e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`:** Extended at the end (lines 133–144), as required in slice 1 step 7, with a direct URL visit, `page.reload()` and `page.goBack()`. All other 23 E2E scenarios remained unchanged.

### 6. Result of each gate command (A2)
- `pnpm lint`: **green** (`oxlint --deny-warnings`: 0 warnings, 0 errors across 879 files).
- `pnpm -r typecheck`: **green** (all workspace packages including `api-client`, `core`, `tokens`, `ui`, `api`, `mobile-web`).
- `pnpm -r test`: **green** (`apps/website` 5/5, `packages/api-client` 12/12, `packages/tokens` 45/45, `packages/core` 693/693, `packages/ui` 63/63, `apps/api` 873/873, `apps/mobile-web` 712/712).
- `node e2e/scenarios/run-all-scenarios.mjs` (via `ATTACH` to `localhost:5434` / `:3301` / `:4173`): **green** (`ALL 24 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!`).
- `pnpm --filter @steuereule/e2e no-client-persistence` (via `ATTACH`): **green** (`PASS — localStorage: {} · sessionStorage: {}` at all 5 checkpoints).
- `pnpm --filter @steuereule/e2e breakpoint-layout` (via `ATTACH`): **green** (`PASS — all breakpoint layout assertions succeeded` across 375–1920 px).

### 7. Open questions
1. Should `ProfileHome` (`/app/profil`) and `Privacy` (`/app/profil/datenschutz`) remain accessible to guests as before (DSGVO (GDPR) transparency & existing tests in `App.test.tsx`), or should they in future also be redirected to `AccountWall` via `<RequiresAccount>` (including adjusting the guest profile tests)?
2. The slice 1 assignment, section 5, says `@react-navigation/bottom-tabs@^7` (installed and matched to `@react-navigation/native@7.3.14` with `^7.18.14`, because `7.21.0` triggered a runtime `TypeError: render is not a function` with the installed `@react-navigation/native`). Should `@react-navigation/native` be upgraded separately in the long run?

---

## Slice 2 — Hub cockpit

### 1. Status
**done** (PR #449 answers implemented; the earlier stopping point on § 2.4 fully resolved)

### 2. Branch and last commit hash
- Branch: `feat/443-s2-hub-cockpit` (branched from `feat/443-s1-navigation` at `405f6c78621bb65e8516b137dd78fba14a06707b`)
- Last code/test commit before this report commit: `f4cd8b96ed384fbb92d055bce6bb2d5f082dd0db` (`test(e2e): adapt scenarios for hub cockpit and deferred amount roundtrip`); also includes the PR #449 review fixes R2–R5 (`a3e59ba`, `0015103`, `6806df0`), § 2.4 (`da6ad81`, `e47cdd0`, `47ec891`) and § 2.1–2.3 (`59c2351`, `91837a4`, `60ea864`, `8752858`). This report follows immediately as the closing commit on `feat/443-s2-hub-cockpit`.

### 3. Changed and new files
- `apps/api/openapi.json`: updates the OpenAPI specification with the optional field `TaxEstimateDto.laterAmounts`.
- `apps/api/src/advisor/advisor.service.ts`: replaces local `Number(...)` amount parsing for catalog amounts with `amountFromAnswer`, so that `'spaeter'` is treated as `null` instead of `NaN`.
- `apps/api/src/owl-mode/owl-mode.service.ts`: replaces local `parsePositiveInt` parsing for catalog amounts with `amountFromAnswer`, so that `'spaeter'` does not lead to `NaN` or wrong sums.
- `apps/api/src/printout/printout.service.ts`: uses `amountFromAnswer` when reading catalog amounts (`dhf-miete`, `umzug-kosten`, `spenden-betrag`, `riester-betrag`, `kv-pv-betrag` etc.) for the PDF printout.
- `apps/api/src/tax-estimate/dto/tax-estimate.dto.ts`: adds the optional property `laterAmounts?: number` with `@ApiPropertyOptional`.
- `apps/api/src/tax-estimate/tax-estimate.service.ts`: counts the tax year's `laterAmountSteps` (for both persons under Zusammenveranlagung (joint assessment)), widens the `result` via `widenForLaterAmounts` when `kind === 'spanne'` and sets `laterAmounts` when the count is `> 0`.
- `apps/api/test/advisor.service.test.ts`: adds a service test that `'spaeter'` in `CaseDigest` evaluates to `null` instead of `NaN`.
- `apps/api/test/interview.service.test.ts`: tests `postAnswer` with `'spaeter'` for allowed steps (`spenden-betrag`) and rejection (`InvalidAnswerValueError`) for non-allowed integer steps.
- `apps/api/test/openapi-contract.test.ts`: checks the OpenAPI declaration of `TaxEstimateDto.laterAmounts`.
- `apps/api/test/owl-mode.service.test.ts`: adds a test that `'spaeter'` is safely parsed as `null`/`0` in the owl context.
- `apps/api/test/printout.service.test.ts`: adds a unit test that `'spaeter'` does not produce a `NaN` entry when filling the PDF.
- `apps/api/test/tax-estimate.service.test.ts`: tests that a `'spaeter'` answer raises `result.to` by exactly `UNCERTAINTY_PER_ITEM` (`60 €`) with `result.from` unchanged (and counts twice for married couples).
- `apps/mobile-web/App.test.tsx`: adapts the tunnel expectations to the hub cockpit (`onDone`/`onBack` → `CockpitHome`) and adds tests for `cockpit-weiter`, the hidden CTA after all steps are completed and `revisit` via tiles.
- `apps/mobile-web/App.tsx`: additionally clears `rememberReturnTo(null)` in `onSignedOut` on sign-out (PR #449 review R2).
- `apps/mobile-web/package.json`: pins `@react-navigation/bottom-tabs` as `~7.18.14` instead of `^7.18.14` to match the installed `@react-navigation/native` version (PR #449 review R3).
- `apps/mobile-web/src/i18n/resources.ts`: adds i18n texts (`de` & `en`) for `cockpit.naechsterSchritt`, `cockpit.kachel.*`, `plausibilitaet.hinweis.betrag-spaeter` and `katalog.amountLater`.
- `apps/mobile-web/src/navigation/AppTabs.tsx`: documents in a comment the deliberate inactive display (not focus-dependent) of tab screens under `@react-navigation/bottom-tabs` (PR #449 review R4).
- `apps/mobile-web/src/navigation/CockpitStack.tsx`: passes `onOpenTile` to `CockpitScreen` and navigates to the matching screen based on `TileDefinition` + `revisit`.
- `apps/mobile-web/src/navigation/CockpitTunnelRoutes.tsx`: dissolves the old tunnel edges for `Lstb`, `CrossBorder`, `Catalog` and `Workdays` (`onDone` and `onBack` → `CockpitHome`).
- `apps/mobile-web/src/screens/capital/CapitalScreen.test.tsx`: extends the test helper with `queryClient`/`onBack` and tests cache invalidation as well as waiting for running mutations.
- `apps/mobile-web/src/screens/capital/CapitalScreen.tsx`: waits for running save mutations before `onDone` and invalidates dependent queries (`cockpitSummary`, `taxEstimate`, `capital`).
- `apps/mobile-web/src/screens/catalog/CatalogScreen.test.tsx`: adds tests for `katalog-later-<step>` (only for `LATER_ALLOWED_STEPS`), saving `'spaeter'` and query invalidation on completion.
- `apps/mobile-web/src/screens/catalog/CatalogScreen.tsx`: adds the quiet button `katalog-later-<step>` („Betrag später eintragen“ ("Enter amount later")) for `LATER_ALLOWED_STEPS` and invalidates the cockpit, estimate and interview caches on completion/answering.
- `apps/mobile-web/src/screens/children/ChildrenScreen.test.tsx`: adds tests for cache invalidation and `onBack` before leaving `ChildrenScreen`.
- `apps/mobile-web/src/screens/children/ChildrenScreen.tsx`: synchronizes mutations and invalidates cockpit/estimate queries before `onDone`.
- `apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`: narrows existing „Weiter mit deinem Weg“ ("Continue on your path") tests to guest mode (`isSignedIn: false`) and adds hub cockpit tests for tile status, `betrag-offen`, the order of `cockpit-weiter` and `revisit`.
- `apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx`: wires in `useCockpitTileFacts`, `<CockpitTiles>` and `nextStepTile` for `cockpit-weiter` („Nächster Schritt: {{titel}}“ ("Next step: {{titel}}")).
- `apps/mobile-web/src/screens/cockpit/CockpitTiles.tsx`: new UI component for loading the query facts (`useCockpitTileFacts`) and rendering the hub tiles with `Card`, status label (`offen`/`erledigt`/`⏳ Betrag offen`) and `revisit` calculation.
- `apps/mobile-web/src/screens/cockpit/tiles.test.tsx`: new unit test suite for `TILES`, visibility rules, status determination of all 10 tiles including `betrag-offen`, `nextStepTile` per path and `hasAnswersForEntry`.
- `apps/mobile-web/src/screens/cockpit/tiles.ts`: pure definition of `TILES`, `NEXT_STEP_ORDER`, `nextStepTile`, `visibleTiles` and `hasAnswersForEntry` without React dependencies.
- `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.test.tsx`: adds tests for `onBack` and waiting for running mutations + query invalidation before `onDone`.
- `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx`: adds the `onBack` prop, waits for running mutations before `onDone` and invalidates dependent queries.
- `apps/mobile-web/src/screens/interview/InterviewScreen.test.tsx`: tests query invalidation when completing the minimal-gate interview.
- `apps/mobile-web/src/screens/interview/InterviewScreen.tsx`: invalidates `cockpitSummary`, `taxEstimate` and `interview` before `onDone`.
- `apps/mobile-web/src/screens/lstb/LstbScreen.test.tsx`: adds tests for waiting for running field PUTs and cache invalidation on `lstb-weiter`.
- `apps/mobile-web/src/screens/lstb/LstbScreen.tsx`: uses `usePendingMutations`, waits for running LStB mutations before `onDone` and invalidates dependent queries.
- `apps/mobile-web/src/screens/pension/PensionerScreen.test.tsx`: adds tests for `onBack`, the mutation wait and query invalidation.
- `apps/mobile-web/src/screens/pension/PensionerScreen.tsx`: adds `onBack`, waits for running mutations before `onDone` and invalidates cockpit/estimate caches.
- `apps/mobile-web/src/screens/plausibility/PlausibilityScreen.test.tsx`: adds a test for the `betrag-spaeter` notice without blocking the filing status.
- `apps/mobile-web/src/screens/plausibility/PlausibilityScreen.tsx`: passes `answers` to `checkPlausibility` so that `betrag-spaeter` is detected.
- `apps/mobile-web/src/screens/rental/RentalScreen.test.tsx`: adds tests for `onBack`, running mutations and query invalidation.
- `apps/mobile-web/src/screens/rental/RentalScreen.tsx`: waits for running mutations before `onDone` and invalidates cockpit/estimate/rental queries.
- `apps/mobile-web/src/screens/shared/usePendingMutations.ts`: new small helper hook (`useIsMutating`-based waiting for open writes before a screen completes).
- `apps/mobile-web/src/screens/workdays/WorkdaysScreen.test.tsx`: adds tests for `onBack` and cache invalidation after saving.
- `apps/mobile-web/src/screens/workdays/WorkdaysScreen.tsx`: adds `onBack`, waits for running commute mutations and invalidates dependent queries before `onDone`.
- `docs/agent-prompts/443-batch-report.md`: updates the section „Slice 2 — Hub cockpit“ to the finished state with all check and file evidence.
- `e2e/scenarios/01-lena-hoffmann-angestellt.mjs`: switches the tunnel run to `nextStep(page)` and temporarily bridges the removed automatic plausibility edge until slice 3 via the direct URL `/plausibilitaet`.
- `e2e/scenarios/02-markus-brenner-grenzgaenger-ch.mjs`: replaces automatic tunnel transitions after the Swiss Lohnausweis (Swiss salary certificate) and catalog screens with `nextStep(page)`.
- `e2e/scenarios/03-julia-brenner-grenzgaengerin-ch.mjs`: replaces automatic tunnel transitions in Markus' and Julia's runs with `nextStep(page)`.
- `e2e/scenarios/04-weber-ehepaar-zusammenveranlagung.mjs`: switches the flow to `nextStep(page)` and temporarily opens `/plausibilitaet` directly before the assessment comparison.
- `e2e/scenarios/06-sarah-fischer-homeoffice-riester.mjs`: switches the flow to `nextStep(page)` and additionally checks the § 2.4/§ 2.6 round trip (`umzug-kosten` → `katalog-later-umzug-kosten` → status `⏳ Betrag offen` → revisit via `openTile` → amount `1500` → status `Erledigt`).
- `e2e/scenarios/07-david-richter-alleinerziehend.mjs`: switches the step sequence to `nextStep(page)` and checks plausibility before the assessment comparison via `/plausibilitaet`.
- `e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`: clarifies the comments on the `page.goBack()` check (PR #449 review R5).
- `e2e/scenarios/10-florian-weber-hybrid-beides.mjs`: adds `nextStep(page)` before the commute after the hub return from `sonderausgaben`.
- `e2e/scenarios/12-carlos-santos-expat-ch-only-gate.mjs`: adds `nextStep(page)` between LStB and the `lebenslagen` catalog.
- `e2e/scenarios/13-erika-zimmermann-verwitwet.mjs`: adds `nextStep(page)` between LStB and the `lebenslagen` catalog.
- `e2e/scenarios/14-keller-ehepaar-veranlagungsvergleich.mjs`: switches catalog/screen changes to `nextStep(page)` and opens `/plausibilitaet` directly until the slice 3 gate.
- `e2e/scenarios/15-martina-vogt-hybrid-schweiz.mjs`: explicitly uses `openTile(page, 'einkuenfte' | 'sonderausgaben' | 'arbeitsweg')` after the CH Lohnausweis, because a partial CH record is not yet done.
- `e2e/scenarios/16-sabine-kranz-geschieden-kind.mjs`: switches the run to `nextStep(page)` and calls `/plausibilitaet` directly.
- `e2e/scenarios/17-maximilian-allesgeber-maximal-katalog.mjs`: moves between LStB and the three catalogs via `nextStep(page)`.
- `e2e/scenarios/18-thorsten-grenzfall-arbeitstage-widerspruch.mjs`: after saving the commute, checks tile status `Erledigt` and plausibility via `nextStep(page)` or `/plausibilitaet`.
- `e2e/scenarios/20-dialog-matrix-kataloge-zickzack.mjs`: adapts the zigzag and revisit checks to the hub cockpit via `nextStep(page)` and `openTile(page, …)`.
- `e2e/scenarios/21-dialog-matrix-submasken-und-partner-b.mjs`: replaces the tunnel up to the commute with `nextStep(page)` and opens `/plausibilitaet` directly before the comparison.
- `e2e/scenarios/22-dialog-matrix-crud-detailmasken.mjs`: uses `nextStep(page)` after completing the LStB for `lebenslagen`.
- `e2e/scenarios/23-dialog-matrix-gast-upgrade-und-steuerjahre.mjs`: adds `nextStep(page)` between the Swiss Lohnausweis (2025) and the catalog.
- `e2e/scenarios/24-advisor-chat-steuereule.mjs`: switches the starting flow before the owl chat to `nextStep(page)` and `/plausibilitaet`.
- `e2e/scenarios/helpers/scenario-harness.mjs`: adds the helpers `openTile(page, tileId)` and `nextStep(page)` required in § 2.6.
- `packages/api-client/src/generated/steuerschaetzung.faker.ts`: also generates the optional field `laterAmounts` for Faker mocks.
- `packages/api-client/src/generated/steuerschaetzung.msw.ts`: updates the generated MSW handlers from the new OpenAPI spec.
- `packages/api-client/src/generated/steuerschaetzung.schemas.ts`: adds `laterAmounts?: number` to the generated TypeScript schema `TaxEstimateDto`.
- `packages/core/src/domains/employee.test.ts`: tests `employeeFromAnswers` / `employeeFromData` with `'spaeter'` as a `0 €` fallback without `NaN`.
- `packages/core/src/domains/employee.ts`: uses `amountFromAnswer` for `intFrom` amount steps from the allowlist.
- `packages/core/src/domains/health-insurance.test.ts`: tests `parseAmount` / `healthInsuranceFromAnswers` with `'spaeter'` as a `0 €` fallback.
- `packages/core/src/domains/health-insurance.ts`: replaces local `parseAmount` parsing of the catalog KV/PV (health/long-term care insurance) steps with `amountFromAnswer`.
- `packages/core/src/interview/cockpit.test.ts`: adds tests for `widenForLaterAmounts` with `count` `0`, `1`, `3` and `RangeError` for a negative `count`.
- `packages/core/src/interview/cockpit.ts`: exports `widenForLaterAmounts(range, count)` (raises `to` by `count * UNCERTAINTY_PER_ITEM` with `from` unchanged).
- `packages/core/src/interview/interview.test.ts`: tests `AMOUNT_LATER`, `LATER_ALLOWED_STEPS`, `laterAmountSteps` and `isValidAnswer` (allowed vs. forbidden steps).
- `packages/core/src/interview/interview.ts`: exports `AMOUNT_LATER`, `LATER_ALLOWED_STEPS`, `laterAmountSteps`, `amountFromAnswer` and allows `'spaeter'` in `isValidAnswer` only for `LATER_ALLOWED_STEPS`.
- `packages/core/src/interview/plausibility.test.ts`: adds tests for the `betrag-spaeter` notice.
- `packages/core/src/interview/plausibility.ts`: adds `PlausibilityInput.answers?` and produces the notice `{ kind: 'betrag-spaeter', steps }` as soon as `laterAmountSteps(answers)` is not empty.
- `pnpm-lock.yaml`: stores the exact tilde pinning `~7.18.14` for `@react-navigation/bottom-tabs`.

### 4. Deviations from the assignment
- **PR #449 review R1 (`renderActiveStackRoute` unmounts `CockpitHome`) deliberately left for slice 4:** In slice 2, non-sheet routes do not need `CockpitHome` rendered in the background at the same time; R1 is implemented specifically in slice 4 (§ 4.2), when the sheet group is introduced. R2–R5 from the review are already fixed on this branch.
- **Temporary direct URL `/plausibilitaet` in slice 2 E2E scenarios:** Since § 2.1 dissolves the transition `Workdays -> Plausibility` (back to `CockpitHome`), but the filing tile `cockpit-abgabe-vorbereiten` only exists from slice 3 on, scenarios `01`, `04`, `06`, `07`, `14`, `16`, `18`, `21` and `24` temporarily call `/app/steuerjahr/<jahr>/plausibilitaet` directly in slice 2 and are switched to `cockpit-abgabe-vorbereiten` in slice 3.
- **Waiting for open write mutations (`usePendingMutations.ts`) and cache invalidation:** With the tunnel gone, a „Weiter“ ("Continue") click lands straight back on `CockpitHome`. So that asynchronous blur/submit PUTs from detail screens and the catalog reliably complete before the jump back, and tile status and the tax estimate are correct immediately, the screens briefly wait for running mutations via `useIsMutating()` and invalidate the affected queries in a targeted way.
- **Local E2E port configuration:** Since port `5432` is taken, all E2E gates were run in `ATTACH` mode against `localhost:5434` (see the note at the start of the report).

### 5. Adjusted existing tests/scenarios
- **`apps/mobile-web/App.test.tsx`:** The previous tunnel test `tunnel unchanged: LStB onDone -> Catalog lebenslagen -> onDone -> Catalog einkuenfte -> onBack -> lebenslagen with revisit` explicitly checked the tunnel edges abolished in § 2.1 and was replaced by tests for the hub cockpit (`onDone`/`onBack` → `CockpitHome`, `cockpit-weiter`, hidden button after completion, `revisit` flag).
- **`apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`:** In the block `"Weiter mit deinem Weg"`, `isSignedIn: false` was set explicitly, because in slice 2 signed-in users who have fully answered the minimal gate see the hub tiles + `"Nächster Schritt: ..."` (`cockpit-weiter`) instead of the old guest notice. All domain assertions were left untouched.
- **`apps/mobile-web/src/screens/catalog/CatalogScreen.test.tsx`:** Helper type extended with `'einkuenfte'` and new tests for `katalog-later-<step>` and query invalidation added; existing tests unchanged.
- **`CapitalScreen.test.tsx`, `ChildrenScreen.test.tsx`, `CrossBorderScreen.test.tsx`, `InterviewScreen.test.tsx`, `LstbScreen.test.tsx`, `PensionerScreen.test.tsx`, `RentalScreen.test.tsx`, `WorkdaysScreen.test.tsx`:** Only the render helpers were extended with optional `queryClient`/`onBack` parameters and new invalidation/mutation-wait/back tests added.
- **`e2e/scenarios/08-navigation-gast-und-alle-screens.mjs`:** Comments on the `page.goBack()` check clarified per PR #449 R5.
- **`e2e/scenarios/{01,02,03,04,06,07,10,12,13,14,15,16,17,18,20,21,22,23,24}` & `e2e/scenarios/helpers/scenario-harness.mjs`:** Only navigation steps switched from the previous tunnel to `nextStep(page)` / `openTile(page, id)` per § 2.6 (plus the temporary `/plausibilitaet` call before slice 3 and a new check for „Betrag später eintragen“ in scenario 06). All euro amounts, PDF fields and tax calculations remained unchanged.

### 6. Result of each gate command (A2)
Verified on the final code/test state `f4cd8b96ed384fbb92d055bce6bb2d5f082dd0db`:
- `pnpm lint`: **green** (`oxlint --deny-warnings`: 0 warnings, 0 errors across 884 files).
- `pnpm -r typecheck`: **green** (all 8 workspace projects without errors).
- `pnpm -r test`: **green** (`apps/website` 5/5, `packages/api-client` 12/12, `packages/tokens` 45/45, `packages/core` 702/702, `packages/ui` 63/63, `apps/api` 881/881, `apps/mobile-web` 744/744). In addition `pnpm register-check`: **PASS**; `pnpm adr-check`: **PASS**.
- `node e2e/scenarios/run-all-scenarios.mjs` (via `ATTACH` to `localhost:5434` / `:3301` / `:4173`): **green** (`ALL 24 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!`).
- `pnpm --filter @steuereule/e2e no-client-persistence` (via `ATTACH`): **green** (`PASS — localStorage: {} · sessionStorage: {}` at all 5 checkpoints).
- `pnpm --filter @steuereule/e2e breakpoint-layout` (via `ATTACH`): **green** (`PASS — all breakpoint layout assertions succeeded` across 375–1920 px).

### 7. Open questions
- **none** (all questions from the earlier stop report were fully resolved in PR #449 / `443-batch-all-slices.md`; PR #449 R1 remains earmarked specifically for slice 4 § 4.2).

---

## Slice 3 — Submission gate

### 1. Status
**done**

### 2. Branch and last commit hash
- Branch: `feat/443-s3-submission-gate` (branched from `feat/443-s2-hub-cockpit` at `53d7dd2`)
- Last code/test commit before this report commit: `09809dcb0b99b004109f17744cc7f3c4f5de342b` (`test(e2e): route submission, comparison, and printout flows through submission gate`); before that it includes `4b64081` (`usePlausibility`), `25f9cb2` (`FINDING_TILE`), `4f2aa8e` (live tile hints), `c91731c` (`SubmissionGateContext` & `SubmissionScreen`), `a983f99` (cockpit filing tile & `PrintoutRoute` gate) and `f0af412` (stabilizing `CockpitScreen.test.tsx`). This report follows immediately as the closing commit on `feat/443-s3-submission-gate`.

### 3. Changed and new files
- `apps/mobile-web/App.tsx`: locks `PrintoutRoute` behind the submission gate (`usePlausibility` + `useSubmissionGate`, return from Stripe `?zahlung=...` only when the gate is passed), otherwise redirects via `navigation.replace('App', { screen: 'Cockpit', params: { screen: 'Submission', params: { year } } })` and resets `resetSubmissionGate()` on sign-out.
- `apps/mobile-web/App.test.tsx`: adds tests for redirecting `/app/steuerjahr/2025/ausdruck` on a conflict (`lstb-offen`), notice confirmation including reset after re-mount, and the Stripe return URL; adapts the previous printout smoke test to the gate with a complete LStB.
- `apps/mobile-web/src/i18n/resources.ts`: adds i18n texts (`de` & `en`) for `cockpit.kachel.hinweis.*`, `cockpit.abgabe.*` and `abgabe.*`.
- `apps/mobile-web/src/navigation/CockpitStack.tsx`: registers `Submission` (`SubmissionRoute`) and wires `onOpenSubmission` in `CockpitHomeRoute`.
- `apps/mobile-web/src/navigation/CockpitTunnelRoutes.tsx`: implements `SubmissionRoute` under `RequiresAccount` with navigation to tile targets (`onOpenTile`), `CockpitHome` and the root `Printout`.
- `apps/mobile-web/src/navigation/ShellState.tsx`: wires `SubmissionGateProvider` into the app shell and passes `confirmNotices`, `areNoticesConfirmed` and `resetSubmissionGate` through `useShellState()`.
- `apps/mobile-web/src/navigation/SubmissionGateContext.tsx`: new lean context for the in-memory confirmation of plausibility notices per tax year and `Notice['kind']` set (reset automatically after reload).
- `apps/mobile-web/src/navigation/linking.ts`: adds the URL mapping `Submission: 'abgabe'` under `steuerjahr/:year`.
- `apps/mobile-web/src/navigation/linking.test.tsx`: adds the URL round-trip test for `/app/steuerjahr/2025/abgabe`.
- `apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx`: computes `usePlausibility` for the selected tax year, computes tile hint levels (`blocker`/`warnung`), routes `cockpit-weiter` (when all tiles are done) as well as `cockpit-ausdruck` and the new filing tile to `onOpenSubmission`.
- `apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`: adds tests for tile blocker/warning hints, `cockpit-abgabe-vorbereiten`, redirecting `cockpit-ausdruck` to `Submission`, and an `act` flush in the pensioner `cockpit-weiter` test.
- `apps/mobile-web/src/screens/cockpit/CockpitTiles.tsx`: renders optional hint labels per tile (`cockpit-kachel-<id>-hinweis`, error color from `useTheme()` for blockers) and the wide filing tile `cockpit-abgabe-vorbereiten` below the other tiles.
- `apps/mobile-web/src/screens/cockpit/tiles.ts`: adds `FINDING_TILE: Record<Conflict['kind'] | Notice['kind'], TileId | 'abgabe'>`, `tilesForFinding` and `tileHintSeverity`.
- `apps/mobile-web/src/screens/cockpit/tiles.test.tsx`: tests every single mapping of `Conflict['kind']` and `Notice['kind']` in `FINDING_TILE`, `tilesForFinding` (including `betrag-spaeter` via answer entries) and `tileHintSeverity`.
- `apps/mobile-web/src/screens/filing-type-comparison/FilingTypeComparisonScreen.tsx`: adds an optional `embedded` prop so the component can be embedded directly in `SubmissionScreen` without the outer screen wrapper and app bar.
- `apps/mobile-web/src/screens/plausibility/PlausibilityScreen.tsx`: obtains conflicts, notices, the master data gap and retry directly via `usePlausibility`, with unchanged behavior.
- `apps/mobile-web/src/screens/plausibility/usePlausibility.ts`: new hook for `usePlausibility(taxYear) → { status, conflicts, notices, missingPersonalDetails, answers, retry }` (with path-dependent LStB evaluation).
- `apps/mobile-web/src/screens/plausibility/usePlausibility.test.tsx`: new test suite for loading, error, fileable, conflict and notice states as well as the CH/pensioner path without a German LStB.
- `apps/mobile-web/src/screens/shared/BackButton.tsx`: adds an optional `testID` prop for unique back buttons (`abgabe-zurueck`).
- `apps/mobile-web/src/screens/submission/SubmissionScreen.tsx`: new screen for the three-stage submission gate (plausibility with tile buttons & `gate-warnung-bestaetigen`, Veranlagungsartenvergleich (comparison of assessment types) only for married + Zusammenveranlagung with `abgabe-vergleich-ueberspringen`, printout button `abgabe-zum-ausdruck`).
- `apps/mobile-web/src/screens/submission/SubmissionScreen.test.tsx`: new TDD test suite for the conflict lock, notice confirmation including the renewed confirmation requirement on a new notice, the conditional assessment comparison and `abgabe-zum-ausdruck`.
- `e2e/scenarios/{01,03,04,05,06,07,08,14,16,18,21,24}`: switch direct `/plausibilitaet` navigation and `cockpit-ausdruck` transitions to the submission gate; scenario `08` checks the blocked direct visit to `/app/steuerjahr/2025/ausdruck` with an open LStB.
- `docs/agent-prompts/443-batch-report.md`: documents slice 3 in this section.

### 4. Deviations from the assignment
- **Path-aware LStB check in `usePlausibility.ts`:** The previous `fold()` in `PlausibilityScreen.tsx` always produced the conflict `lstb-offen` for CH Grenzgänger (cross-border commuters) (scenario `03`) and pensioners (scenario `05`) for lack of a German LStB. Without forbidden changes to `packages/core`, `usePlausibility` treats an empty LStB as `vollstaendig` for non-`angestellte` paths (unless there is an explicit LStB contradiction), so that pensioners and CH Grenzgänger can reach the printout through the submission gate (see Open questions).
- **Modular additions (`SubmissionGateContext.tsx`, `BackButton.tsx` `testID`, `PlausibilityHookResult` fields):** To stay within the 300-line limit (A5) and to supply `SubmissionScreen`/`SubmissionRoute` type-safely with the required gate data (`missingPersonalDetails`, `answers`, `retry`, `abgabe-zurueck`), the gate state was encapsulated in `SubmissionGateContext.tsx` and `BackButton` was extended with an optional `testID`.
- **Local E2E port configuration:** Execution mode `ATTACH` on `localhost:5434` as described above.

### 5. Adjusted existing tests/scenarios
- **`apps/mobile-web/App.test.tsx`:** In the existing test `keeps /app/steuerjahr/2025/ausdruck mapped to the root Printout screen when plausibility gate passes`, a valid LStB mock was added, because from slice 3 on an empty LStB state rightly redirects to `Submission` (the unauthorized direct visit is checked by two new gate tests directly below it).
- **`apps/mobile-web/src/screens/cockpit/CockpitScreen.test.tsx`:** In the pensioner test (`completes without lstb...`), before `fireEvent.click(cockpit-weiter)` the passive `useEffect` update of `react-native-web`'s `PressResponder` is awaited via `waitFor(...)` and `await act(async () => {})`, after the button switched asynchronously from `rente` to `Abgabe vorbereiten`.
- **`e2e/scenarios/{01,03,04,05,06,07,08,14,16,18,21,24}`:** Pure navigation adjustments per § 3.6 from direct `/plausibilitaet` calls or a direct `cockpit-ausdruck → Printout` to `cockpit-abgabe-vorbereiten` → `abgabe-zum-ausdruck` (including the assessment comparison for `verheiratet` + `zusammen` in `03`, `04`, `14`, `21` and the direct URL lock in `08`). All input values, euro amounts and PDF checks remained unchanged.

### 6. Result of each gate command (A2)
Verified on `09809dcb0b99b004109f17744cc7f3c4f5de342b`:
- `pnpm lint`: **green** (`oxlint --deny-warnings`: 0 warnings, 0 errors across 889 files).
- `pnpm -r typecheck`: **green** (all 8 checked workspace projects without errors).
- `pnpm -r test`: **green** (`apps/website` 5/5, `packages/api-client` 12/12, `packages/tokens` 45/45, `packages/core` 702/702, `packages/ui` 63/63, `apps/api` 881/881, `apps/mobile-web` 67 files / 762 passed). In addition `pnpm register-check`: **PASS**; `pnpm adr-check`: **PASS**.
- `node e2e/scenarios/run-all-scenarios.mjs` (via `ATTACH` to `localhost:5434` / `:3301` / `:4173`): **green** (`ALL 24 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!`).
- `pnpm --filter @steuereule/e2e no-client-persistence` (via `ATTACH`): **green** (`PASS — localStorage: {} · sessionStorage: {}` at all 5 checkpoints).
- `pnpm --filter @steuereule/e2e breakpoint-layout` (via `ATTACH`): **green** (`PASS — all breakpoint layout assertions succeeded` across 375–1920 px).

### 7. Open questions
1. Should `packages/core/src/interview/plausibility.ts` (`checkPlausibility`) be made path-aware in a separate issue, so that CH Grenzgänger and pensioners without a German LStB do not produce `lstb-offen` in the core in the first place (instead of the workaround check in `usePlausibility.ts`)?

---

## Slice 4 — Sheets

### 1. Status
**done**

### 2. Branch and last commit hash
- Branch: `feat/443-s4-sheets` (branched from `feat/443-s3-submission-gate` at `b6d6e4c`)
- Last code/test commit before this report commit: `3acb8517791bdbedb585625f4925fc6877bbbf8b` (`test(e2e): adapt scenarios for Sheet backdrop and auto-save on close`); before that `9fa36b7` (`Sheet` + gallery), `5a1f5ad` (`CockpitSheet` + `transparentModal` + `blurActiveInput`), `3ccd7d4` (`blurActiveInput.test.tsx`), `ae85be9`/`2d06e48` (pop attempt discarded again), `d313516` (`InterviewScreen` observer refetch) and `5a800cf` (capture-phase `Escape` for focused `TextInput`s). This report follows immediately as the closing commit on `feat/443-s4-sheets`.

### 3. Changed and new files
- `apps/mobile-web/App.test.tsx`: adds 4 app tests for slice 4 (`CockpitHome` stays mounted with the `TabBar` hidden, auto-save via the close button and `Escape`, no PUT for a staged LStB scan draft).
- `apps/mobile-web/src/i18n/resources.ts`: adds `sheet.schliessen` („Schließen“ / „Close“) to `appResources`.
- `apps/mobile-web/src/lib/blurActiveInput.ts`: new helper for leaving active web inputs (`blur()`) or hiding the native keyboard (`Keyboard.dismiss()`).
- `apps/mobile-web/src/lib/blurActiveInput.test.tsx`: new unit tests for `blurActiveInput` in the web and native paths and without `document`.
- `apps/mobile-web/src/navigation/AppTabs.tsx`: hides the floating `TabBar` and releases `tabBarClearance` as soon as a sheet route is active in the cockpit stack.
- `apps/mobile-web/src/navigation/CockpitDetailRoutes.tsx`: wraps `CapitalRoute`, `RentalRoute`, `ChildrenRoute` and `PartnerRoute` in `<CockpitSheet navigation={navigation}>`.
- `apps/mobile-web/src/navigation/CockpitSheet.tsx`: new thin wrapper component that runs `blurActiveInput()` on close first and then navigates back to `CockpitHome`.
- `apps/mobile-web/src/navigation/CockpitStack.tsx`: groups the 9 sheet routes in a `Stack.Group` with `presentation: 'transparentModal'` and `animation: 'slide_from_bottom'`.
- `apps/mobile-web/src/navigation/CockpitTunnelRoutes.tsx`: wraps `LstbRoute`, `PensionRoute`, `CrossBorderRoute`, `CatalogRoute` and `WorkdaysRoute` in `<CockpitSheet navigation={navigation}>`.
- `apps/mobile-web/src/navigation/guards.ts`: extends `renderActiveStackRoute` so that `CockpitHome` stays mounted while a sheet route is on top of the stack.
- `apps/mobile-web/src/navigation/routes.ts`: exports `SHEET_ROUTE_NAMES` and `isSheetRouteName(name)`.
- `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx`: additionally invalidates the interview query when saving CH fields, so that tile/plausibility observers behind the sheet update immediately.
- `apps/mobile-web/src/screens/interview/InterviewScreen.tsx`: on reaching the end of the interview, enables reloading of active interview observers (`getInterviewControllerGetInterviewQueryKey`), so that the mounted cockpit behind it updates.
- `apps/mobile-web/src/screens/interview/InterviewScreen.test.tsx`: adds a unit test for the active interview refetch when the last question is completed.
- `e2e/scenarios/{03,04,05,06,07,08,10,11,12,13,14,15,16,18,20,21,23,24}` & `e2e/scenarios/helpers/scenario-harness.mjs`: wait for the sheet to close (`[data-testid="sheet-schliessen"]` detached) before subsequent cockpit/TabBar checks; scenario `23` explicitly uses `sheet-schliessen` after resuming CH.
- `e2e/scenarios/22-dialog-matrix-crud-detailmasken.mjs`: adds, per § 4.4, the E2E test for closing via `sheet-schliessen` (`65000`) and via `Escape` (`64000`), including an awaited `PUT /lstb` and persistence after reopening.
- `packages/ui/src/components/Sheet.tsx`: implements the responsive `Sheet` component (< 768 px bottom sheet with a rounded top edge and a `PanResponder` `sheet-grabber` > 120 px, ≥ 768 px centered panel `WIDE_CONTENT_MAX_WIDTH`, `Card` outline/shadow, semi-transparent backdrop, `sheet-schliessen`, capture-phase `Escape`, `role="dialog"` / `aria-modal` and focus into the panel).
- `packages/ui/src/components/Sheet.test.tsx`: new unit tests for the grabber breakpoint, backdrop/button/`Escape` closing (including from a focused `<Input>`), pull-to-dismiss (> 120 px vs. < 120 px) and accessibility.
- `packages/ui/src/gallery/Gallery.tsx`: adds an interactive „Sheet“ section to the UI gallery.
- `packages/ui/src/i18n/resources.ts`: adds the default label `sheet.schliessen` in the `UI_NS` namespace.
- `packages/ui/src/index.ts`: exports `Sheet` and `SheetProps`.
- `docs/agent-prompts/443-batch-report.md`: documents slice 4 in this section.

### 4. Deviations from the assignment
- **Capture phase for `Escape` in `Sheet.tsx`:** `react-native-web`'s `TextInput.handleKeyDown` calls `e.stopPropagation()`, so an ordinary bubble-phase listener on `window` is never reached while an input field has focus. `window.addEventListener('keydown', handleKeyDown, true)` intercepts `Escape` in the capture phase, so that the focus-blur save and closing per § 4.3/§ 4.4 work reliably.
- **Cockpit visibility behind the sheet (Chromium check § 4.2):** Sheets opened from the cockpit (`[CockpitHome, <Sheet>]`) leave the cockpit visible behind the semi-transparent backdrop at 1280 px and 375 px in a real Chromium browser, so the backdrop stayed semi-transparent as required in § 4.1. Only on the one-time automatic entry directly after the minimal gate (`[CockpitHome, Interview, LStB]`) does `@react-navigation/native-stack` hide the bottom route (`CockpitHome`) via `display: none`, because `Interview` sits in between (not a `transparentModal`).
- **Observer update on interview completion (`InterviewScreen.tsx` / `CrossBorderScreen.tsx`):** Since `CockpitHome` now stays mounted while a sheet is open, completing the interview must update active interview observers instead of waiting for a remount with `refetchType: 'none'`.
- **Test suffix & file split:** `blurActiveInput.test.tsx` instead of `.test.ts` because of the Vitest include pattern (`*.test.tsx`), `CockpitSheet.tsx` as a small wrapper file below the 300-line limit (A5).
- **Local E2E port configuration:** Execution mode `ATTACH` on `localhost:5434` as described above.

### 5. Adjusted existing tests/scenarios
- **`apps/mobile-web/App.test.tsx`:** Existing tests unchanged; 4 new tests for slice 4 added.
- **`apps/mobile-web/src/screens/interview/InterviewScreen.test.tsx`:** Existing tests unchanged; 1 test for refetching active observers on interview completion added.
- **`e2e/scenarios/{03..08,10..16,18,20,21,23,24}` & `scenario-harness.mjs`:** Only navigation/synchronization wait steps added, so that `assertEstimate`/cockpit clicks or tab switches (`23`) only take effect after the sheet close animation has finished. All euro amounts and PDF expectations remained unchanged.
- **`e2e/scenarios/22-dialog-matrix-crud-detailmasken.mjs`:** Extended per § 4.4 with closing via `sheet-schliessen` (`65000`) and `Escape` (`64000`), including an awaited `PUT /lstb` and a value check after reopening.

### 6. Result of each gate command (A2)
Verified on `3acb8517791bdbedb585625f4925fc6877bbbf8b` (together with the `e2e` run on `5a800cf` + these `e2e` files committed unchanged):
- `pnpm lint`: **green** (`oxlint --deny-warnings`: 0 warnings, 0 errors across 894 files).
- `pnpm -r typecheck`: **green** (all 8 workspace projects without errors).
- `pnpm -r test`: **green** (`apps/website` 5/5, `packages/api-client` 12/12, `packages/tokens` 45/45, `packages/core` 702/702, `packages/ui` 73/73, `apps/api` 881/881, `apps/mobile-web` 769/769). In addition `pnpm register-check`: **PASS**; `pnpm adr-check`: **PASS**.
- `node e2e/scenarios/run-all-scenarios.mjs` (via `ATTACH` to `localhost:5434` / `:3301` / `:4173`): **green** (`ALL 24 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!`).
- `pnpm --filter @steuereule/e2e no-client-persistence` (via `ATTACH`): **green** (`PASS — localStorage: {} · sessionStorage: {}` at all 5 checkpoints).
- `pnpm --filter @steuereule/e2e breakpoint-layout` (via `ATTACH`): **green** (`PASS — all breakpoint layout assertions succeeded` across 375–1920 px).

### 7. Open questions
- **none**.

---

## Slice 5 — Persona boosters & dual cockpit

### 1. Status
**done** *(checked locally with lint, typecheck and all new/directly changed unit and component tests as instructed by the user; full `pnpm -r test` and E2E runs moved to cloud CI)*

### 2. Branch and last commit hash
- Branch: `feat/443-s5-persona-boosters` (branched from `feat/443-s4-sheets` at `81be5c206134e68f8ecb4c58133fa97d15ca42a1`)
- Last code/scenario commit: after this commit (together with the scenario and report commit); code commits before it: `d3bc97cba7cbfd374f5f67cf5c958050b1063d97` (core), `a92e094234e542900e2b60856274d013dd6fe138` (API & client), `4a63d2321387d523bdd4b353aeee9cbc064038b7` (mobile web).

### 3. Changed and new files
- `packages/core/src/math/tax-parameters.ts`: adds parameters for § 35a EStG (`householdServices`) and § 33 Abs. 3 EStG (`extraordinaryBurdens`, tiers per BFH VI R 75/14).
- `packages/core/src/domains/household-services.ts` & `household-services.test.ts`: implements the tax reduction under § 35a EStG (household services), including mini-job (20 %, max. 510 €), services (20 %, max. 4.000 €) and tradesperson services (20 %, max. 1.200 €) in cents, plus all boundary tests.
- `packages/core/src/domains/extraordinary-burdens.ts` & `extraordinary-burdens.test.ts`: implements the tiered reasonable burden (§ 33 Abs. 3 EStG) across all 12 table cells plus the mandatory test case (`GdE 51.835 €`, 2 children -> `1.408,70 €`).
- `packages/core/src/domains/index.ts`: exports the new domain modules.
- `packages/core/src/interview/interview.ts` & `interview.test.ts`: adds the `EntryId` entries `haushalt` (`haushalt-gate` and 3 amount questions including `LATER_ALLOWED_STEPS`) and `gesundheit` (`gesundheit-gate`, `gesundheit-betrag`).
- `packages/core/src/engine/tax-estimate.ts`, `tax-estimate.test.ts`, `married-estimate.ts` & `married-estimate.test.ts`: takes deductible medical costs into account in the zvE (taxable income) and the § 35a tax reduction (never below 0 € tax) in the estimate functions **`taxEstimateEmployee`**, **`taxEstimateCrossBorder`**, **`estimateMarriedCouple`** and the internal helper **`estimate`**.
- `apps/api/src/config/features.ts` & `apps/mobile-web/src/config/features.ts`: sets `HOUSEHOLD_AND_HEALTH_BOOSTERS = false` (because § 35a / § 33 are not yet wired into the print templates, § 5.7 & ADR-0032).
- `apps/api/src/interview/interview.controller.ts` & `interview.service.ts`: admits `haushalt` and `gesundheit` in `ADMITTED_ENTRY_IDS` and in the Swagger `enum`.
- `apps/api/src/tax-estimate/tax-estimate.service.ts`: in **`getState`**, **`getFilingComparison`**, **`estimateIndividual`**, **`countLaterAmounts`** and **`employeeInputs`**, includes both booster catalogs depending on `HOUSEHOLD_AND_HEALTH_BOOSTERS`, or honestly excludes them when `false`.
- `apps/api/test/{interview.boosters.test.ts,tax-estimate.boosters.test.ts}`: tests interview admission and estimate integration (flag on/off).
- `apps/api/openapi.json` & `packages/api-client/src/generated/interview.schemas.ts`: regenerated OpenAPI specification and API client types for `haushalt`/`gesundheit`.
- `apps/mobile-web/src/navigation/routes.ts` & `CockpitTunnelRoutes.tsx`: extends `CatalogEntryParam` and `CATALOG_ENTRIES` with `alleinerziehend`, `haushalt` and `gesundheit`.
- `apps/mobile-web/src/i18n/resources.ts`: adds German and English texts for questions/notices on `haushalt`/`gesundheit`, new tile titles, „Weitere Themen“ ("More topics"), `Nachzahlung senken`/`Erstattung erhöhen` and dual cockpit sections.
- `apps/mobile-web/src/screens/cockpit/personas.ts` & `personas.test.tsx`: implements and tests all 7 rules of `derivePersonas(answers, masterData)`.
- `apps/mobile-web/src/screens/cockpit/tiles.ts` & `tiles.test.tsx`: adds the `personas` column, the tiles `alleinerziehend`, `haushalt`, `gesundheit` (the latter hidden via the feature flag `HOUSEHOLD_AND_HEALTH_BOOSTERS`) and `partitionTiles(facts)`.
- `apps/mobile-web/src/screens/cockpit/CockpitPartnerSection.tsx`, `CockpitTiles.tsx`, `CockpitScreen.tsx`, `CockpitDetailRoutes.tsx`, `CockpitStack.tsx` & `CockpitSlice5.test.tsx`: implements the booster heading, the collapsible „Weitere Themen“ section (`cockpit-weitere-themen`), the dual cockpit (`Du` & `{{name}}` with `partner-lstb`/`partner-arbeitsweg`, partner name never in the URL) and direct back navigation from `Partner` to `CockpitHome` (if not opened from master data).
- `apps/mobile-web/src/screens/catalog/CatalogScreen.tsx` & `CatalogScreen.boosters.test.tsx`: supports all 6 `CatalogEntryParam` entries and renders optional notices (`katalog-hinweis-<step>`).
- `e2e/scenarios/{04-weber-ehepaar-zusammenveranlagung,05-hans-meyer-rentner-kapital,07-david-richter-alleinerziehend}.mjs`: checks dual cockpit partner tiles after returning from master data (04), `kapital` in the main section and `arbeitsweg` under `cockpit-weitere-themen` (05), and `cockpit-kachel-alleinerziehend` (07).
- `docs/agent-prompts/443-batch-report.md`: updates the report for slice 5 after the decision to continue.

### 4. Deviations from the assignment
- **GdE (total amount of income) calculation for § 33 Abs. 3 EStG (option 1 per the user's decision after clarifying the stop rule):** Since `TaxEstimateService` only calculates `angestellte`/`verheiratet` and scenario 07 (`alleinerziehend`) must not be changed by a flat upfront deduction of § 24b in the general zvE, the estimator uses `Math.max(0, incomeSum)` as the GdE basis and deducts `singleParentReliefEur` (`4.260 €`) only within the § 33 GdE calculation when `singleParent: true` is passed (scenario 07 expectations remain unchanged).
- **Feature flag `HOUSEHOLD_AND_HEALTH_BOOSTERS = false` (§ 5.7):** The print templates (`apps/api/src/printout/felder-2025.json` and `printout-values.ts`) do not yet contain field mappings for § 35a / § 33; therefore `haushalt` and `gesundheit` stay hidden via the flag and are ignored in the tax estimate.
- **Test suffix & local test strategy as instructed by the user:** New mobile-web unit tests use `.test.tsx` because of the Vitest include pattern. Following the user's explicit instruction, only the new/directly changed unit tests as well as `lint` and `pnpm -r typecheck` were run locally; `pnpm -r test` and the E2E runs take place in cloud CI.

### 5. Adjusted existing tests/scenarios
- **`apps/mobile-web/src/screens/cockpit/tiles.test.tsx`:** Existing tests for the `TILES` list (10 -> 13 tiles) and `visibleTiles` adapted to the persona/„Weitere Themen“ model (§ 5.2) and flag control (§ 5.7); all status and `nextStepTile` tests left unchanged in substance.
- **`e2e/scenarios/04-weber-ehepaar-zusammenveranlagung.mjs`:** Partner LStB and partner commute are entered directly in the dual cockpit (`cockpit-bereich-du`, `cockpit-bereich-partner`, `partner-lstb`, `partner-arbeitsweg`) after saving master data via `stammdaten-zurueck`; the URL contains no partner name; euro/PDF expectations unchanged.
- **`e2e/scenarios/05-hans-meyer-rentner-kapital.mjs`:** Checks `cockpit-kachel-kapital` directly in the main section and `cockpit-kachel-arbeitsweg` only after expanding `cockpit-weitere-themen`.
- **`e2e/scenarios/07-david-richter-alleinerziehend.mjs`:** Checks the visibility of `cockpit-kachel-alleinerziehend` on the cockpit.

### 6. Result of each gate command (A2)
Targeted local check after all slice 5 changes (state `4a63d23` + E2E scenario updates):
- `pnpm lint`: **green** (`oxlint --deny-warnings`: 0 warnings, 0 errors across 907 files).
- `pnpm -r typecheck`: **green** (all 8 workspace projects).
- New/changed unit & component tests: **green**:
  - `@steuereule/core` (`household-services`, `extraordinary-burdens`, `interview`, `tax-estimate`, `married-estimate`): **117/117** passed.
  - `@steuereule/api` (`interview.boosters`, `tax-estimate.boosters`, `openapi-contract`): **45/45** passed.
  - `@steuereule/mobile-web` (`personas`, `tiles`, `CockpitSlice5`, `CockpitScreen`, `CatalogScreen.boosters`, `CatalogScreen`): **95/95** passed.
- Full `pnpm -r test`: **not run locally** (moved to cloud CI as instructed by the user).
- `node e2e/scenarios/run-all-scenarios.mjs`, `no-client-persistence`, `breakpoint-layout`: **not run locally** (moved to cloud CI as instructed by the user).

### 7. Open questions
1. **Print templates for § 35a / § 33 (§ 5.7):** `apps/api/src/printout/felder-2025.json` and `printout-values.ts` do not yet have field mappings for `anlage-haushaltsnahe-aufwendungen` and `anlage-aussergewoehnliche-belastungen` (hence `HOUSEHOLD_AND_HEALTH_BOOSTERS = false` in API & mobile web).
2. **Full GdE coverage beyond employees/married couples (§ 5.5/§ 5.6 option 1):** For `rentner` and other income types, `TaxEstimateService` so far does not calculate at all (`nur-angestellte`); § 24b (`singleParentReliefEur`) is for now used only in the § 33 GdE deduction, so that existing refund/scenario 07 values stay stable. Should § 24b in future also be deducted directly in the regular `zvE` of single parents?

---

## Slice 6 — Dark mode

### 1. Status
**done** *(checked locally with lint, typecheck and `@steuereule/tokens`, `@steuereule/ui` and all new/affected `@steuereule/mobile-web` unit tests as instructed by the user; full `pnpm -r test` and the E2E runs including `dark-mode` take place in cloud CI)*

### 2. Branch and last commit hash
- Branch: `feat/443-s6-dark-mode` (branched from `feat/443-s5-persona-boosters` at `d60e6a2234b312aeddfdba177f541e41b7e46918`)
- Last code/test commit before this report commit: `a6a16cfef27fc11ebdf8645e9f9daf5a3c4bd219` (`test(e2e): add dark-mode appearance and persistence e2e gate`); before that `048eec5` (palette & WCAG contrast test), `76c9cec` (`inkOnFunke` in `@steuereule/ui`) and `3d827b1` (app preference, profile UI & contrast fixes). This report follows immediately as the closing commit on `feat/443-s6-dark-mode`.

### 3. Changed and new files
- `finanzo-funke-design-system/project/tokens/dunkel.css` & `finanzo-funke-design-system/project/_ds_manifest.json`: check the 6 `colors.css` colors missing from `dunkel.css` (`--funke`, `--funke-hell`, `--ki`, `--ok`, `--warn`, `--fehler`) and define `--fehler: #e96a61` (a 30 % mix of `#e0362c` towards `--fehler-weich` `#fde3de`) for WCAG AA text contrast ≥ 4.5:1 on `grund` (`5,92:1`), `karte` (`5,28:1`) and `fehlerWeich` (`5,14:1`); the other 5 colors remain unchanged (`--funke`/`--funke-hell` as the brand lime green, `--ki` as a brand/border color next to the text token `--ki-tinte: #cfc4ff`, `--ok` with `5,32:1`/`4,74:1`, `--warn` with `6,19:1`/`5,52:1`).
- `packages/tokens/dist/{theme.ts,tokens.css}`: regenerated from the updated manifest via `pnpm --filter @steuereule/tokens build`.
- `packages/tokens/src/contrast.test.ts`: computationally checks all dark mode text-on-surface contrast pairs (`>= 4.5:1`), `funke` (`>= 4.5:1`), light/dark hard shadows (`shadow.hart*.shadowColor`) and protects `--fehler: #e96a61` via TDD.
- `packages/ui/src/theme/useTheme.ts` & `packages/ui/src/index.ts`: export `inkOnFunke(t)` (`t.color.nacht` `#0d0f08` in dark mode, `t.color.tinte` `#191b12` in light mode), because in dark mode `t.color.tinte` (`#f2f0e3`) on lime surfaces (`t.color.funke` `#c9f229`) would be unreadable white-on-lime.
- `packages/ui/src/components/{Button,Chip,Option,Sticker,TabBar}.tsx` & `dark-mode.test.tsx`: use `inkOnFunke(t)` for text/labels on `funke` surfaces and test this in `light` & `dark`; a check for fixed hex/`rgba(` values in `packages/ui/src` found 0 hard-coded color literals.
- `apps/mobile-web/src/lib/appearance.tsx` & `appearance.test.tsx`: encapsulate `AppearancePreference` (`'system' | 'light' | 'dark'`), `APPEARANCE_STORAGE_KEY = 'steuereule.appearance'`, `readAppearancePreference` / `writeAppearancePreference` (with `try/catch`, no write access on initialization/read), `resolveThemeMode`, `AppearanceProvider` and `useAppearance`.
- `apps/mobile-web/src/test-setup.ts`: additionally clears `localStorage` after each test, so that `steuereule.appearance` does not bleed between tests.
- `apps/mobile-web/src/icons/AppleG.tsx` & `apps/mobile-web/src/screens/shared/SocialSignInSection.tsx`: replace `#1d1d1f` in the Apple logo with the `color` prop (default `useTheme().color.tinte`, passed explicitly from `t.color.tinte`); `GoogleG.tsx` remains unchanged.
- `apps/mobile-web/App.tsx` & `apps/mobile-web/src/App.appearance.test.tsx`: wire in `AppearanceProvider`, read `RN.useColorScheme()` + the preference for `<ThemeProvider mode={mode}>` and `<StatusBar style={mode === 'dark' ? 'light' : 'dark'} />`, set the root background & `NavigationContainer theme` from `useTheme()` and synchronize `document.body.style.backgroundColor = t.color.grund` as well as `document.documentElement.style.colorScheme` on web.
- `apps/mobile-web/src/i18n/resources.ts`, `apps/mobile-web/src/screens/profile/{ProfileAppearanceSection,ProfileView}.tsx` & `ProfileScreen.test.tsx`: add i18n (`profil.darstellung.{titel,system,hell,dunkel}`, `de` & `en`) and the profile section „Darstellung“ ("Appearance") with `Option` buttons (`profil-darstellung-system`, `profil-darstellung-hell`, `profil-darstellung-dunkel`), which takes effect immediately and persists only on click.
- `apps/mobile-web/src/navigation/AppTabs.tsx`, `apps/mobile-web/src/screens/{LoginScreen,RegistrationScreen}.tsx`, `login/loginStyles.ts`, `profile/styles.ts`, `workdays/WorkdaysScreen.tsx`, `deadlines/DeadlinesBanner.tsx`, `interview/styles.ts`, `onboarding/styles.ts`, `funnel/KontoWandScreen.tsx`, `pension/PensionerScreen.tsx` & `advisor/{AdvisorChatPanel,InMaskAdvisorCompanion,OwlModeScreen}.tsx`: switch text/icon colors on `funke` surfaces to `inkOnFunke(t)` and AI texts to `t.color.kiTinte`, so that dark and light contrasts are correct.
- `e2e/responsive/dark-mode.mjs` & `e2e/package.json`: add the E2E script `dark-mode` (`colorScheme: 'dark'`, checks cockpit, sheet screen and profile for a dark `grund`, switches to `Immer hell` ("Always light") and checks after reload).
- `docs/agent-prompts/443-batch-report.md`: adds this section, slice 6.

### 4. Deviations from the assignment
- **`_ds_manifest.json` maintained as well:** Since `@steuereule/tokens` (`build.ts` and `generated.test.ts`) generates its tokens from `finanzo-funke-design-system/project/_ds_manifest.json`, `--fehler: #e96a61` was entered 1:1 in the manifest as well as in `dunkel.css`.
- **Extended dark mode contrast fixes (`inkOnFunke(t)` & `kiTinte`):** In several app screens and `packages/ui`, `t.color.tinte` (a light `#f2f0e3` in dark mode) or `t.color.funkeTinte` (`#d9f077`) previously sat directly on a lime background (`t.color.funke` `#c9f229`), as did `t.color.ki` on a violet background. These places were systematically switched to `inkOnFunke(t)` or `t.color.kiTinte`.
- **Modular file naming (`appearance.tsx`, `ProfileAppearanceSection.tsx`):** `appearance.tsx` uses `.tsx` because of the `AppearanceContext.Provider` JSX; `ProfileAppearanceSection.tsx` keeps file lengths under ~300 lines per A5.
- **Local verification as instructed by the user:** Instead of a full `pnpm -r test` and a local E2E run, `pnpm lint`, `pnpm -r typecheck`, `node --check e2e/responsive/dark-mode.mjs` and all `@steuereule/tokens`, `@steuereule/ui` and new/affected `@steuereule/mobile-web` tests were run; the full suite and E2E follow in cloud CI.

### 5. Adjusted existing tests/scenarios
- **`apps/mobile-web/src/screens/ProfileScreen.test.tsx`:** Existing tests unchanged; `describe('ProfilScreen — Darstellung (Slice 6)')` added (checks the default `System` without an initial write to `localStorage`, the immediate switch to `dark`/`light` and German/English texts).

### 6. Result of each gate command (A2)
Verified after the changes were completed (code state `a6a16cfef27fc11ebdf8645e9f9daf5a3c4bd219`):
- `pnpm lint`: **green** (`oxlint --deny-warnings`: 0 warnings, 0 errors across 914 files).
- `pnpm -r typecheck`: **green** (all 8 workspace projects without errors).
- Targeted unit & component tests: **green**:
  - `@steuereule/tokens`: **49/49** (including the new `contrast.test.ts`).
  - `@steuereule/ui`: **75/75** (including the new `dark-mode.test.tsx`).
  - `@steuereule/mobile-web` (`App.test.tsx`, `appearance.test.tsx`, `App.appearance.test.tsx`, `ProfileScreen.test.tsx`, `LoginScreen.test.tsx`, `RegistrationScreen.test.tsx`, `OwlModeScreen.test.tsx`): **173/173** and (`WorkdaysScreen.test.tsx`, `PensionerScreen.test.tsx`): **12/12**.
- `node --check e2e/responsive/dark-mode.mjs`: **green**.
- Full `pnpm -r test`: **not run locally** (moved to cloud CI as instructed by the user).
- `node e2e/scenarios/run-all-scenarios.mjs`, `no-client-persistence`, `breakpoint-layout`, `dark-mode`: **not run locally** (moved to cloud CI as instructed by the user).

### 7. Open questions
1. **Light mode semantic colors (`ok`, `warn`, `fehler`):** In the audit of `packages/tokens/src/contrast.test.ts`, `ok` (`#1f9d55`), `warn` (`#e07b00`) and `fehler` (`#e0362c`) on light light-mode backgrounds (`#f4f2e9` / `#ffffff`) are below `4,5:1` (`~3,1–4,0:1`), while in dark mode with `--fehler: #e96a61` all checked pairs meet `>= 4,5:1`. Should darkened semantic text tokens be added for light mode in a separate token ticket?
2. **Dark mode toggle in the `@steuereule/ui` `Gallery`:** Should the UI gallery in `packages/ui/src/gallery/Gallery.tsx` also get a `light`/`dark` toggle for manual checking in future?

---

## Slice 7 — Keyboard & haptics

### 1. Status
**done** *(checked locally with lint, typecheck and all new/affected `@steuereule/ui` and `@steuereule/mobile-web` unit/integration tests as instructed by the user; full `pnpm -r test` and the E2E runs take place in cloud CI)*

### 2. Branch and last commit hash
- Branch: `feat/443-s7-keyboard-haptics` (branched from `feat/443-s6-dark-mode` at `53b7f5f9109e9345386fefcdf92676900d7cda8d`)
- Last code/test commit before this report commit: `f60a305a7f56fdbeb131b63528af6b8c0f326e49` (`feat(haptics): wire haptics preferences, profile toggle, cockpit and save feedback`); before that `05ff729aa4883af28f4478c0ed4463e427eefab3` (keyboard `inputmode="numeric"` & `KeyboardAvoidingView` in the `Sheet`) and `d7f96e3063e2b3ba2af30ceb4cd9da90f759dc2c` (`expo-haptics`, `packages/ui/src/lib/haptics.ts` & UI primitives). This report follows immediately as the closing commit on `feat/443-s7-keyboard-haptics`.

### 3. Changed and new files
- `packages/ui/package.json` & `pnpm-lock.yaml`: adds `expo-haptics` in the version matching Expo SDK 53, **`~14.1.4`** (`apps/mobile-web/node_modules/expo/bundledNativeModules.json`).
- `packages/ui/src/lib/haptics.ts` & `haptics.test.tsx`: implements and tests `hapticSelection`, `hapticLight`, `hapticMedium`, `hapticSuccess`, `hapticWarning`, `setHapticsEnabled` and `isHapticsEnabled` (a strict no-op on `Platform.OS === 'web'` without a dynamic import of `expo-haptics`; on native, a check of `AccessibilityInfo.isReduceMotionEnabled()` and the user setting, plus silently catching any haptics errors).
- `packages/ui/src/index.ts`: exports the 7 haptics symbols from `@steuereule/ui`.
- `packages/ui/src/components/Button.tsx`, `Option.tsx` & `TabBar.tsx`: trigger `hapticMedium()` on `Button` (`variant="primaer"`), `hapticLight()` on `Option` and `hapticSelection()` on an active tab change in `TabBar` (`tab.id !== active`).
- `packages/ui/src/components/Sheet.tsx` & `Sheet.test.tsx`: wrap the sheet content in `KeyboardAvoidingView` (`behavior={sheetKeyboardBehavior(Platform.OS)}`: `'padding'` on iOS, `undefined` otherwise) and test this behavior per platform.
- `packages/ui/src/components/form-controls.test.tsx`: adds the unit test that `<Input type="numeric">` renders `inputmode="numeric"` on web.
- `apps/mobile-web/src/screens/LoginScreen.tsx` & `LoginScreen.test.tsx`: switches the 2FA TOTP input field (`totp`) to `type="numeric"` and tests `inputmode="numeric"`.
- `apps/mobile-web/src/screens/security/SecurityScreen.tsx` & `SecurityScreen.test.tsx`: switches the 2FA setup code field (`code` during TOTP setup) to `type="numeric"` and tests `inputmode="numeric"`.
- `apps/mobile-web/src/screens/master-data/MasterDataScreen.tsx` & `MasterDataScreen.test.tsx`: switches `stammdaten-hausnummer` to `type="numeric"` (`stammdaten-plz` already had `numeric`), tests `inputmode="numeric"` and triggers `hapticWarning()` on validation, consent, pairing and network errors.
- `apps/mobile-web/src/lib/hapticsPreference.ts` & `hapticsPreference.test.tsx`: encapsulate reading/writing the `localStorage` key `steuereule.haptics` (`try/catch`, default `true`, **never** writes on start/read), including unit tests with blocked storage.
- `apps/mobile-web/App.tsx`: synchronizes the stored haptics preference on start (module initialization + `useEffect`) via `syncHapticsPreference()` without write access to `localStorage`.
- `apps/mobile-web/src/i18n/resources.ts`, `apps/mobile-web/src/screens/profile/ProfileHapticsSection.tsx`, `ProfileView.tsx` & `ProfileScreen.test.tsx`: add the section „Haptisches Feedback“ ("Haptic feedback") (`profil-haptik`) only on native platforms (hidden on web; writes `steuereule.haptics` and calls `setHapticsEnabled` only on toggling; including `de`/`en` texts and unit tests).
- `apps/mobile-web/src/screens/shared/saveFeedback.ts`: bundles `triggerSaveErrorHaptic`, `warnOnHttpError` and `watchSaveResult` for uniformly triggering `hapticWarning()` on failed PUT/POST/DELETE save operations (HTTP error statuses such as 4xx/5xx as well as network rejects).
- `apps/mobile-web/src/screens/cockpit/{CockpitScreen.tsx,CockpitTiles.tsx,CockpitPartnerSection.tsx,tiles.ts}`: trigger `hapticSelection()` on a tax year change and `hapticSuccess()` on status transitions of settled tiles (`!pending`, previously `!== 'erledigt'` → now `'erledigt'`, tracked separately per year, including the partner tiles `partner-lstb`/`partner-arbeitsweg`).
- `apps/mobile-web/src/screens/{submission/SubmissionScreen.tsx,plausibility/PlausibilityScreen.tsx}`: trigger `hapticWarning()` as soon as a blocking conflict is shown for the first time in the selected tax year in the submission gate or the plausibility screen.
- `apps/mobile-web/src/screens/{OnboardingScreen.tsx,ProfileScreen.tsx,assessment/AssessmentScreen.tsx,capital/CapitalScreen.tsx,catalog/CatalogScreen.tsx,children/ChildrenScreen.tsx,confirmation/ConfirmationScreen.tsx,cross-border/CrossBorderScreen.tsx,interview/InterviewScreen.tsx,lstb/LstbScreen.tsx,pension/PensionerScreen.tsx,receipts/ReceiptsScreen.tsx,rental/RentalScreen.tsx,workdays/WorkdaysScreen.tsx}`: trigger `hapticWarning()` on save, validation, delete, upload and 409 conflict errors.
- `apps/mobile-web/src/lib/hapticsWiring.test.tsx`: tests the app haptics integration for year changes (`hapticSelection`), tile and partner tile completion (`hapticSuccess`), submission/plausibility conflicts (`hapticWarning`) and save errors in workdays, catalog (409) and master data (`hapticWarning`).

#### Full review of all `<Input>`/`TextInput` fields in `apps/mobile-web/src` (§ 7.1)
- **Newly switched to `type="numeric"` (3 fields):**
  1. `apps/mobile-web/src/screens/LoginScreen.tsx`: 2FA one-time code (`totp`, previously implicitly `text`).
  2. `apps/mobile-web/src/screens/security/SecurityScreen.tsx`: 2FA confirmation code on TOTP activation (`code`, previously implicitly `text`).
  3. `apps/mobile-web/src/screens/master-data/MasterDataScreen.tsx`: house number (`stammdaten-hausnummer`, previously implicitly `text`; `hausnummerZusatz` stays `text` for e.g. `"a"`).
- **Already on `type="numeric"` beforehand (checked, unchanged):** `OnboardingScreen` (Steuer-ID (tax ID)), `ProfileEdit` (Steuer-ID), `MasterDataScreen` (`plz`), `LstbScreen`, `CrossBorderScreen` (all CHF/EUR fields + manual exchange rate), `PensionerScreen` (pension amounts + year), `CatalogScreen` (all amount steps), `WorkdaysScreen` (vacation/sick/home office/public holiday days & distance), `CapitalScreen`, `RentalScreen` (all amounts, postcode, living area, units, share A), `ChildrenScreen` (`kind-steuerid`, Kindergeld (child benefit), Kinderzulage, KV/PV), `AssessmentScreen` (Bescheid (tax assessment notice) fields & amount objection), `ReceiptsScreen` (different tax year), `FilingTypeComparisonScreen` (stamp PIN/tax value).
- **Deliberately left as `type="text"` (alphanumeric / separators needed):** date fields (`TT.MM.JJJJ` / `JJJJ-MM-TT` in `MasterDataScreen`, `ChildrenScreen`, `AssessmentScreen`, `ConfirmationScreen`), month field `JJJJ-MM` (`ch-wechselkurs-monat` in `CrossBorderScreen`), `+49` phone number & `DE...` IBAN (`MasterDataScreen`), hex pairing code (`kopplung-code` in `MasterDataScreen`), combined street + house number (`vermietung-adresse`), text/name/email/password/chat inputs.

### 4. Deviations from the assignment
- **Manual installation of `expo-haptics@~14.1.4` instead of `npx expo install`:** `pnpm --filter @steuereule/ui exec npx expo install expo-haptics` does not install/resolve directly via `packages/ui` without its own `expo` package; following the explicit fallback instruction in § 7.2, exactly the bundled version matching Expo SDK 53, `~14.1.4`, was entered in `packages/ui/package.json` and resolved via `pnpm install`.
- **Test mock target in `hapticsWiring.test.tsx`:** Since under pnpm `expo-haptics` is declared only in `packages/ui` (not in `apps/mobile-web`), a `vi.mock('expo-haptics')` from within `apps/mobile-web` does not resolve the dynamic import inside `packages/ui/src/lib/haptics.ts` to the same module path. The native `expo-haptics` boundaries (web no-op, reduce motion, disabled preference, native calls, error swallowing, UI primitives) are fully checked in `packages/ui/src/lib/haptics.test.tsx`; `apps/mobile-web/src/lib/hapticsWiring.test.tsx` spies directly on the `@steuereule/ui` haptics exports (passing through to `actual`).
- **Local verification as instructed by the user:** Instead of a full `pnpm -r test` and E2E runs, `pnpm lint`, `pnpm -r typecheck` and all new and directly changed unit/integration tests were run locally; the full suite and E2E take place in cloud CI.

### 5. Adjusted existing tests/scenarios
- **`packages/ui/src/components/form-controls.test.tsx`, `Sheet.test.tsx`, `apps/mobile-web/src/screens/LoginScreen.test.tsx`, `SecurityScreen.test.tsx`, `master-data/MasterDataScreen.test.tsx`, `ProfileScreen.test.tsx`:** Existing tests unchanged; only extended with `inputmode="numeric"`, `KeyboardAvoidingView` (`Sheet`) and `profil-haptik` tests.

### 6. Result of each gate command (A2)
Targeted local check across the commits `05ff729`, `d7f96e3` and finally on `f60a305a7f56fdbeb131b63528af6b8c0f326e49`:
- `pnpm lint`: **green** (`oxlint --deny-warnings`: 0 warnings, 0 errors across 921 files).
- `pnpm -r typecheck`: **green** (all 8 workspace projects without errors).
- New & directly changed unit/integration tests: **green**:
  - `@steuereule/ui` (`haptics.test.tsx`, `Sheet.test.tsx`, `form-controls.test.tsx` in commits `05ff729` / `d7f96e3`): **29/29** (`haptics.test.tsx`), **15/15** (`Sheet` + `form-controls`).
  - `@steuereule/mobile-web` on `f60a305`: `hapticsPreference.test.tsx` (**3/3**), `hapticsWiring.test.tsx` (**7/7**), `ProfileScreen.test.tsx` (**24/24**), `App.test.tsx` (**41/41**); and earlier on `05ff729` `LoginScreen.test.tsx`, `SecurityScreen.test.tsx` and `MasterDataScreen.test.tsx` (**green**).
- Full `pnpm -r test`: **not run locally** (moved to cloud CI as instructed by the user).
- `node e2e/scenarios/run-all-scenarios.mjs`, `no-client-persistence`, `breakpoint-layout`, `dark-mode`: **not run locally** (moved to cloud CI as instructed by the user).

### 7. Open questions
- **none**.

---

## Overall (part D)

### Branches and last commit hashes
All 7 branches build strictly on one another; **nothing** was pushed, opened or merged:

| Slice | Branch | Last commit hash (branch head) | Notes |
| :--- | :--- | :--- | :--- |
| 1 Navigation | `feat/443-s1-navigation` | `405f6c78621bb65e8516b137dd78fba14a06707b` | incl. closing report commit |
| 2 Hub cockpit | `feat/443-s2-hub-cockpit` | `53d7dd236505d733a2e0ab61187256df076fdbab` | incl. closing report commit |
| 3 Submission gate | `feat/443-s3-submission-gate` | `b6d6e4c48fcd80baaf3c76135218cfc9bb48f7e3` | incl. closing report commit |
| 4 Sheets | `feat/443-s4-sheets` | `81be5c206134e68f8ecb4c58133fa97d15ca42a1` | incl. closing report commit |
| 5 Persona boosters | `feat/443-s5-persona-boosters` | `d60e6a2234b312aeddfdba177f541e41b7e46918` | incl. closing report commit |
| 6 Dark mode | `feat/443-s6-dark-mode` | `53b7f5f9109e9345386fefcdf92676900d7cda8d` | incl. closing report commit |
| 7 Keyboard & haptics | `feat/443-s7-keyboard-haptics` | code/tests `f60a305a7f56fdbeb131b63528af6b8c0f326e49` + the report commit that follows immediately (`HEAD`) | code/tests complete before this commit |

### Consolidated list of all open questions (slices 1–7)
1. **Slice 1 — Guest access to `ProfileHome` and `Privacy`:** Should `ProfileHome` (`/app/profil`) and `Privacy` (`/app/profil/datenschutz`) remain accessible to guests as before (DSGVO transparency & existing guest tests in `App.test.tsx`), or in future also be routed to `AccountWall` behind `<RequiresAccount>`?
2. **Slice 1 — `@react-navigation` version alignment:** `@react-navigation/bottom-tabs` is pinned to `~7.18.14` to match `@react-navigation/native@7.3.14` (`7.21.0` was incompatible at runtime). Should `@react-navigation/native` be upgraded in a separate ticket?
3. **Slice 3 — Path-aware LStB check in the core (`checkPlausibility`):** Should `packages/core/src/interview/plausibility.ts` be made path-aware in substance, so that CH Grenzgänger and pensioners without a German LStB do not produce `lstb-offen` in the core in the first place (instead of the workaround check in `apps/mobile-web/src/screens/plausibility/usePlausibility.ts`)?
4. **Slice 5 — Print templates for § 35a / § 33 (§ 5.7):** `apps/api/src/printout/felder-2025.json` and `printout-values.ts` do not yet contain field mappings for `anlage-haushaltsnahe-aufwendungen` and `anlage-aussergewoehnliche-belastungen` (feature flag `HOUSEHOLD_AND_HEALTH_BOOSTERS = false` in API & mobile web).
5. **Slice 5 — § 24b relief amount in the regular `zvE` (option 1):** `singleParentReliefEur` (`4.260 €`) is for now deducted only within the GdE calculation for § 33 (`extraordinaryBurdens`), to keep existing refund/scenario 07 expectations stable; should § 24b in future also be deducted directly in the regular `zvE` of single parents?
6. **Slice 6 — Light mode semantic colors (`ok`, `warn`, `fehler`):** In the contrast audit (`packages/tokens/src/contrast.test.ts`), `--ok` (`#1f9d55`), `--warn` (`#e07b00`) and `--fehler` (`#e0362c`) in light mode on `#f4f2e9`/`#ffffff` are at `~3,1–4,0:1` (< `4,5:1`), while in dark mode with `--fehler: #e96a61` all checked pairs meet `>= 4,5:1`. Should darkened light mode text tokens be added in a separate token ticket?
7. **Slice 6 — `Gallery` dark mode toggle:** Should `packages/ui/src/gallery/Gallery.tsx` get a `light`/`dark` toggle for manual review?
*(Slices 2, 4 and 7 had no further open questions.)*

### Gate commands run locally vs. moved to cloud CI
- **Slices 1–4:** All gate commands (`pnpm lint`, `pnpm -r typecheck`, full `pnpm -r test` as well as `node e2e/scenarios/run-all-scenarios.mjs`, `no-client-persistence` and `breakpoint-layout` via `ATTACH` to `localhost:5434` / `:3301` / `:4173`) were verified fully green locally.
- **Slices 5–7 (as explicitly instructed by the user):**
  - **Run green locally:** `pnpm lint`, `pnpm -r typecheck`, `node --check e2e/responsive/dark-mode.mjs` (slice 6) and all new and directly affected unit/component/integration tests of the respective slices (`@steuereule/core`, `@steuereule/api`, `@steuereule/tokens`, `@steuereule/ui`, `@steuereule/mobile-web`).
  - **Not run locally (moved to cloud CI):** full `pnpm -r test` on the branches `feat/443-s5-persona-boosters`, `feat/443-s6-dark-mode` and `feat/443-s7-keyboard-haptics` as well as `node e2e/scenarios/run-all-scenarios.mjs`, `pnpm --filter @steuereule/e2e no-client-persistence`, `pnpm --filter @steuereule/e2e breakpoint-layout` and `pnpm --filter @steuereule/e2e dark-mode`.
