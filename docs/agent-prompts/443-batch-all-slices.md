# Batch assignment: Ticket #443 complete (Slices 1–7)

You are working in the **SteuerEule** repo (pnpm monorepo, Expo + react-native-web, shipped **only as a web app**).
You implement **all seven slices of GitHub issue #443** one after another, without asking questions in between. Afterwards a reviewer checks each slice individually.

Read this assignment **in full** before you change anything. Follow it to the letter. If something is not stated here, do **not** decide it yourself: write it under "Open questions" in the report and use the fallback named in the assignment, or leave the point out.

---

## PART A — Working mode (applies to the whole batch)

### A1. Order and branches

The slices are implemented **strictly one after another**. Each slice gets its own branch that builds on the previous one (stacked):

| Slice | Branch | Branched from |
| :--- | :--- | :--- |
| 1 Navigation | `feat/443-s1-navigation` | `origin/main` |
| 2 Hub cockpit | `feat/443-s2-hub-cockpit` | `feat/443-s1-navigation` |
| 3 Submission gate | `feat/443-s3-submission-gate` | `feat/443-s2-hub-cockpit` |
| 4 Sheets | `feat/443-s4-sheets` | `feat/443-s3-submission-gate` |
| 5 Persona boosters | `feat/443-s5-persona-boosters` | `feat/443-s4-sheets` |
| 6 Dark mode | `feat/443-s6-dark-mode` | `feat/443-s5-persona-boosters` |
| 7 Keyboard & haptics | `feat/443-s7-keyboard-haptics` | `feat/443-s6-dark-mode` |

```bash
git fetch origin && git switch -c feat/443-s1-navigation origin/main
```
For each further slice: `git switch -c <new branch>` directly from the finished previous branch.

**Do not push. Do not open PRs. Do not merge anything.** The reviewer does that.

### A2. Gate at the end of each slice

A slice is only done when **all** of these commands are green:

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

The E2E commands start the stack themselves. If the stack does **not start at all** locally (Docker/Postgres missing), write the exact error message into the report once and keep working as long as lint, typecheck and unit tests are green. Then mark each slice in the report with "E2E not verified locally".

### A3. Stop rules (halt the whole batch)

Stop **immediately**, write the report and do **not** start another slice if:
1. a gate command is still red after **three** serious repair attempts;
2. you would have to change a file in a forbidden area (A5) for which this assignment names no exception;
3. an existing test only turns green if you change its expectation in domain terms (e.g. a different euro amount) without this assignment explicitly requiring the change;
4. you would need a value for a tax rule that is not stated here.

A halted batch is a **good** result if the report says exactly where and why.

### A4. Commits

- Small commits, at least one per work step, format `feat(<area>): …`, `test(<area>): …`, `refactor(<area>): …`. In English.
- No commit with a red typecheck or red unit tests.
- Write new tests **first** and see them red, then implement. If the implementation already exists: briefly introduce the bug on purpose, see the test red, take it out again.

### A5. Hard rules (all slices)

- **Only web is checked.** Native variants only behind `Platform.OS !== 'web'`; they must not block anything.
- Do not change **`packages/core`, `apps/api`, DTOs, the Prisma schema, ELSTER print templates**. Exceptions are stated explicitly for Slice 2 and Slice 5.
- **Do not rename or remove any existing `testID` / `data-testid`.** New `testID`s in German with hyphens, in the style of the existing ones (`cockpit-weiter`).
- **Do not delete, weaken or `.skip` existing tests.** A test may only be adjusted if it checks the old click sequence or internal structure, not the domain result. Justify every adjustment in the report.
- **E2E scenarios:** If a scenario turns red, first check whether the app is wrong (then fix the app). Only if the scenario expects the old click sequence, adjust the scenario. **The expected euro amounts, PDF contents and form values in the scenarios must not change in Slices 1–4, 6, 7.**
- **No personal data in URLs** (no names, Steuer-IDs (tax IDs), amounts).
- **No tax data in localStorage/sessionStorage.** Only the keys named here are allowed: `steuereule.returnTo` (sessionStorage), `steuereule.appearance` and `steuereule.haptics` (localStorage).
- **Identifiers, file names, comments, commit messages in English.** Visible UI text in German, always via i18n (`apps/mobile-web/src/i18n/locales/de.json` and `en.json` with the same keys, namespace `APP_NS`). No hard-coded German strings in components.
- **Colors only via `useTheme()`** (`t.color.*`, `t.shadow.*`). No hex values in components.
- **No new dependencies** except `@react-navigation/bottom-tabs` (Slice 1) and `expo-haptics` (Slice 7).
- **Do not let any new file grow beyond ~300 lines.** Rather split it.

### A6. Report

Write the report continuously in `docs/agent-prompts/443-batch-report.md` (one section per slice, right after the slice) and commit it with the last commit of the slice. Structure per slice:

1. **Status:** done / halted (with stop rule number).
2. **Branch and last commit hash.**
3. **Changed and new files:** one sentence each.
4. **Deviations from the assignment:** each with justification, otherwise "none".
5. **Adjusted existing tests/scenarios:** which ones, why.
6. **Result of each gate command (A2):** green/red, for red the output.
7. **Open questions.**

---

## PART B — Required reading before Slice 1

1. `gh issue view 443` in full (context, 22 decisions, slices, AC 1–12).
2. `docs/agent-prompts/443-slice-1-navigation.md` in full: this is the **detailed part for Slice 1**.
3. `apps/mobile-web/App.tsx`, `apps/mobile-web/App.test.tsx`.
4. `apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx`.
5. `apps/mobile-web/src/screens/catalog/CatalogScreen.tsx`.
6. `apps/mobile-web/src/screens/plausibility/PlausibilityScreen.tsx` and `packages/core/src/interview/plausibility.ts`.
7. `packages/core/src/interview/interview.ts` (types `EntryStepId`, `Answers`, value constants).
8. `e2e/scenarios/helpers/scenario-harness.mjs` and `e2e/scenarios/01-lena-hoffmann-angestellt.mjs`.

---

## PART C — The slices

### SLICE 1 — Navigation (tab stacks & a URL per screen)

Carry out **sections 1–7** from `docs/agent-prompts/443-slice-1-navigation.md`. Its sections 8 (commits) and 9 (report) are replaced by Part A; the branch is called `feat/443-s1-navigation`.

Afterwards there is: `apps/mobile-web/src/navigation/` with `routes.ts`, `linking.ts`, `ShellState.tsx`, `CockpitStack.tsx`, `ProfileStack.tsx`, `AppTabs.tsx`, `RequiresAccount.tsx`. All following slices build on it.

---

### SLICE 2 — Hub cockpit

**Goal:** No more tunnel. After the primary document and after each screen, the user returns to the cockpit. The cockpit shows tiles with a status and a highlighted „Nächster Schritt“ ("Next step").

**2.1 Dissolve the tunnel** (in `CockpitStack.tsx`):

| Screen | `onDone` today | `onDone` new |
| :--- | :--- | :--- |
| `Lstb` | Catalog `lebenslagen` | `CockpitHome` |
| `CrossBorder` | Catalog `einkuenfte` | `CockpitHome` |
| `Pension` | `CockpitHome` | unchanged |
| `Catalog` (all `entry`) | next catalog / `Workdays` | `CockpitHome` |
| `Workdays` | `Plausibility` or `CockpitHome` | `CockpitHome` |
| `Plausibility`, `FilingTypeComparison` | as today | unchanged (Slice 3 rebuilds them) |

All `onBack` of the screens lead to `CockpitHome`. Exceptions: `Partner` → `CockpitMasterData` (as today) and `FilingTypeComparison` → `Plausibility` (as today). `revisit` on the catalog is always `true` when the catalog is opened via a tile and answers already exist for this `entry`; otherwise `false`.

**2.2 Tiles.** New file `apps/mobile-web/src/screens/cockpit/tiles.ts` with **one** list of all tiles (pure, without React), and `CockpitTiles.tsx` for rendering. In Slice 2, **all** tiles are visible, except where the "Visible when" column says something (the persona filter comes in Slice 5).

| Tile ID | Route | Visible when | Status "done" when |
| :--- | :--- | :--- | :--- |
| `lstb` | `Lstb` | path `angestellte` | LStB status from `wageTaxCertificateStatus` (core) is complete |
| `ch` | `CrossBorder` | path `ch` | `foldStatus?.kind === 'bestimmt' && exchangeRate !== null` |
| `rente` | `Pension` | path `rente` | `status.kind === 'bestimmt'` |
| `lebenslagen` | `Catalog` `lebenslagen` | always | `nextStepFor(ENTRIES.lebenslagen, answers).kind === 'done'` |
| `einkuenfte` | `Catalog` `einkuenfte` | always | as above with `einkuenfte` |
| `sonderausgaben` | `Catalog` `sonderausgaben` | always | as above with `sonderausgaben` |
| `arbeitsweg` | `Workdays` | path ≠ `rente` | commute query returns recorded workdays |
| `kapital` | `Capital` | always | `status.kind === 'bestimmt'` (half filled = open) |
| `vermietung` | `Rental` | always | `status.kind === 'bestimmt'` (half filled = open) |
| `kinder` | `Children` | interview answer `kinder` ≠ `Nein` | children query returns at least one child |

- The "query" is in each case the hook that the corresponding screen component already uses today (look it up in its file). If "done" cannot be read unambiguously from the response: the tile shows **no** status, and you write it under "Open questions".
- The path comes from `pathFromAnswers(interview.answers)` as today in `CockpitScreen`.
- Status display: `offen` / `erledigt` / `⏳ Betrag offen` (see 2.4). Text via i18n (`cockpit.kachel.status.offen` = „Offen“ ("Open"), `…erledigt` = „Erledigt“ ("Done"), `…betragOffen` = „⏳ Betrag offen“ ("Amount pending"); title `cockpit.kachel.<id>.titel`, German, short).
- testIDs: tile `cockpit-kachel-<id>`, status `cockpit-kachel-<id>-status`.
- The existing buttons `cockpit-kapital`, `cockpit-vermietung`, `cockpit-kinder` **stay** (do not remove the testIDs); they may visually become tiles as long as the testID stays on the clickable element. The same applies to `cockpit-bescheid`, `cockpit-stammdaten`, `cockpit-ausdruck`.
- Style: the existing `Card` component from `@steuereule/ui`, 2px outlines and hard shadows like the other cards. No new style.

**2.3 „Nächster Schritt“.** The existing button `cockpit-weiter` becomes the „Nächster Schritt“ button (testID stays `cockpit-weiter`). It opens the **first visible tile that is not done**, in this order:

- Path `angestellte`: `lstb` → `lebenslagen` → `einkuenfte` → `sonderausgaben` → `arbeitsweg`
- Path `ch`: `ch` → `einkuenfte` → `sonderausgaben` → `arbeitsweg`
- Path `rente`: `rente` → `einkuenfte` → `sonderausgaben` *(confirmed by the product owner)*

When all are done, the button points to „Abgabe vorbereiten“ ("Prepare submission"; from Slice 3 on; in Slice 2 it disappears then). Label via i18n: `cockpit.naechsterSchritt` = „Nächster Schritt: {{titel}}“. For guests and as long as the interview is not finished, today's behavior of `cockpit-weiter` / `cockpit-interview` stays unchanged.

**2.4 „Betrag später eintragen“ ("Enter amount later") (AC 5). Allowed exception: `packages/core`, `apps/api/src/tax-estimate`, and in `apps/api/src/advisor/advisor.service.ts`, `apps/api/src/owl-mode/owl-mode.service.ts`, `apps/api/src/printout/printout.service.ts` only the replacement of the amount parsing.** *(Corrected after PR #449: the tax estimate has no `openItems` mechanism; `UNCERTAINTY_PER_ITEM`/`cockpit-range.ts` belong to the income range.)*
- In `packages/core/src/interview/interview.ts`: constant `export const AMOUNT_LATER = 'spaeter'`, allowlist `export const LATER_ALLOWED_STEPS = ['dhf-miete', 'umzug-kosten', 'spenden-betrag', 'kv-pv-betrag', 'pv-betrag', 'kv-wahl-betrag', 'riester-betrag'] as const` and function `laterAmountSteps(answers: Answers): readonly EntryStepId[]` (all steps whose answer is `AMOUNT_LATER`). Export via the existing index.
- `isValidAnswer` accepts `AMOUNT_LATER` **only** for steps from `LATER_ALLOWED_STEPS`. For all other integer steps (`weg`, `tage`, `ch-nichtrueckkehrtage`, `abfindung-betrag`, `lohnersatz-betrag`, `nebenjob-brutto`, `riester-einnahmen-vorjahr`) it stays invalid.
- New core function `amountFromAnswer(value: string | undefined): number | null` (`null` for `undefined` and `AMOUNT_LATER`). Use it to replace the local parsing of the allowlist steps in `parseAmount` (`packages/core/src/domains/health-insurance.ts`), `intFrom` (`packages/core/src/domains/employee.ts`) and in the three API files named above. `null` → like "not specified". `integerFrom` in `progression-clause.ts` stays unchanged. One test per location that `'spaeter'` does not become `NaN`.
- `packages/core/src/interview/plausibility.ts`: new **notice** (not a conflict) `{ kind: 'betrag-spaeter', steps }` when `laterAmountSteps` is not empty. For this, extend `PlausibilityInput` with the catalog answers if they are missing there.
- Range: pure function `widenForLaterAmounts(result: Range, count: number): Range` in `packages/core/src/interview/cockpit.ts`: `to + count × UNCERTAINTY_PER_ITEM`, `from` unchanged; `count < 0` → `RangeError`. `apps/api/src/tax-estimate/tax-estimate.service.ts` calls it only for `kind === 'spanne'`, with the sum of the year's `AMOUNT_LATER` answers (for married couples, of both persons). Only `result` is widened; `taxableIncome`, `incomeTax` etc. stay. The core estimate functions stay unchanged. `apps/api/src/cockpit` is not touched.
- `TaxEstimateDto` gets `laterAmounts?: number` (only set when > 0). Then `pnpm --filter @steuereule/api openapi:spec` and `pnpm --filter @steuereule/api-client generate`, commit the generated files too.
- `CatalogScreen.tsx`, component `IntegerFollowUp`: a second button below „Weiter“ ("Continue"), **only for steps from `LATER_ALLOWED_STEPS`**, variant `leise`, text i18n `katalog.amountLater` = „Betrag später eintragen“, testID `katalog-later-<step>`. It answers the step with `AMOUNT_LATER`. The catalog then continues as after a normal answer.
- Tile status `⏳ Betrag offen`: when an answer in the tile's catalog `entry` is `AMOUNT_LATER` (takes precedence over "done").
- When the user enters the amount later (opens the catalog with `revisit`, enters a number), the number replaces `AMOUNT_LATER`.

**2.5 Tests (unit, `apps/mobile-web`):** tunnel edges from 2.1; order of `cockpit-weiter` per path; status logic per tile (pure functions in `tiles.ts`); `katalog-later-<step>` stores `spaeter`; tile shows `⏳ Betrag offen`. **Core:** `laterAmountSteps`, notice `betrag-spaeter`, `AMOUNT_LATER` as €0. `widenForLaterAmounts` with `count` 0, 1, 3 and negative; `isValidAnswer` with `spaeter` for allowed and forbidden steps. **API:** service test that a `spaeter` answer raises `result.to` by exactly `UNCERTAINTY_PER_ITEM` and `result.from` stays the same; married couple with one `spaeter` answer each → double (style of the existing tests in `apps/api/test/tax-estimate.service.test.ts`).

**2.6 E2E:** Scenarios 01–07 and 09–18 currently run through the tunnel. Add two helpers in `e2e/scenarios/helpers/scenario-harness.mjs`:
- `openTile(page, tileId)` — clicks `cockpit-kachel-<tileId>` and waits for the screen.
- `nextStep(page)` — clicks `cockpit-weiter` and waits for the screen.

Rework the scenarios so that after each screen they go to the next screen via `nextStep(page)` (or `openTile`, if the scenario needs a different order). **The entered values and expected results stay identical.** In Slice 2 the scenarios open plausibility and the filing type comparison via the existing routes; in Slice 3 they are switched to the gate. In scenario 06, add a case „Betrag später eintragen“ → tile shows `⏳ Betrag offen` → enter the amount → status `Erledigt`.

---

### SLICE 3 — Submission gate

**Goal:** No printout without a passed plausibility check. Warnings already appear on the tiles beforehand.

**3.1 Hook.** Pull the computation out of `PlausibilityScreen.tsx` into a hook `apps/mobile-web/src/screens/plausibility/usePlausibility.ts`: `usePlausibility(taxYear) → { status: 'loading' | 'error' | 'ready', conflicts, notices }`. It uses the same queries and `checkPlausibility` as today. `PlausibilityScreen` then uses the hook (behavior unchanged).

**3.2 Mapping to tiles.** In `tiles.ts`, a constant `FINDING_TILE: Record<Conflict['kind'] | Notice['kind'], TileId | 'abgabe'>`. Map each `kind` from `plausibility.ts` to the tile whose screen fixes the problem (e.g. `lstb-offen` → `lstb`; `betrag-spaeter` → the tile of the `entry` that contains the step). If no tile fits: `'abgabe'`. Each mapping gets a unit test.

**3.3 Live hints on the tiles.** If a tile has a conflict: red hint label (theme color used for errors today), text `cockpit.kachel.hinweis.blocker` = „Muss vor der Abgabe geklärt werden“ ("Must be resolved before submission"). If it only has notices: label `cockpit.kachel.hinweis.warnung` = „Bitte prüfen“ ("Please check"). testID `cockpit-kachel-<id>-hinweis`.

**3.4 Tile „Abgabe vorbereiten“.** Its own wide tile below the others, testID `cockpit-abgabe-vorbereiten`, i18n `cockpit.abgabe.titel` = „Abgabe vorbereiten“. It opens the new route `Submission` (`/app/steuerjahr/:year/abgabe`, add it in `routes.ts`/`linking.ts`/`CockpitStack.tsx`, account-required via `RequiresAccount`). The screen `SubmissionScreen` (new, `apps/mobile-web/src/screens/submission/`) shows in sequence:
1. **Plausibility:** list of the conflicts and notices from `usePlausibility`, each with a button to the corresponding tile route. With conflicts, „Weiter“ is locked. With only notices: button `gate-warnung-bestaetigen`, text `abgabe.warnungenBestaetigen` = „Gelesen, trotzdem weiter“ ("Read, continue anyway").
2. **Filing type comparison:** only for Zusammenveranlagung (joint assessment) (the same condition under which `FilingTypeComparisonScreen` makes sense today; look it up in the master data). Optional: button „Überspringen“ ("Skip") (`abgabe-vergleich-ueberspringen`). Content: the existing `FilingTypeComparisonScreen` embedded.
3. **Printout:** button `abgabe-zum-ausdruck` opens the existing root screen `Printout`.

- The confirmation of the warnings is remembered in `ShellState`, per tax year and per set of notice `kind`s. If a new notice is added, it must be confirmed again. After a reload it is gone (this is intended).
- `cockpit-weiter` points to „Abgabe vorbereiten“ when all tiles of the order from 2.3 are done.

**3.5 Lock the printout.**
- From now on, the button `cockpit-ausdruck` opens `Submission` instead of `Printout` directly (testID stays).
- The root screen `Printout` (in `App.tsx`, `PrintoutRoute`) checks the gate on opening: if there are conflicts **or** unconfirmed notices, replace the route with `App` → `Cockpit` → `Submission` with the same year. The return from Stripe (`payment` param) stays allowed if the gate is passed.
- The old route `Plausibility` stays reachable (the URL stays) so nothing breaks; but the cockpit no longer links to it directly.

**3.6 Tests:** Unit: gate locks on a conflict; notices need confirmation; new notice → confirmation again; comparison only for Zusammenveranlagung; `/app/steuerjahr/2025/ausdruck` with a conflict → `Submission`. **E2E:** all scenarios that currently reach plausibility/comparison/printout (at least 01, 04, 14) go via `cockpit-abgabe-vorbereiten`. In scenario 08, add a case: direct call `/app/steuerjahr/2025/ausdruck` with an open LStB → lands on the submission page.

---

### SLICE 4 — Sheets

**Goal:** Screens open as a sheet over the cockpit. Closing saves.

**4.1 Component `Sheet`** in `packages/ui/src/components/Sheet.tsx` (export in the index of `@steuereule/ui`):
- Props: `onClose: () => void`, `children`, `testID?`.
- Width < 768 px (use `useBreakpoint()` from `@steuereule/ui`): panel across the full width, rounded at the top (`t.radius.*`), a grabber at the top (`sheet-grabber`), slides up from the bottom. Dragging the grabber down by more than 120 px → `onClose`. Use `PanResponder` from `react-native`.
- Width ≥ 768 px: centered panel, max width `WIDE_CONTENT_MAX_WIDTH`, no grabber.
- In both cases: semi-transparent background (color from the theme), click on it → `onClose`; close button at the top right `sheet-schliessen` with an i18n label (passed into `packages/ui` via a `closeLabel` prop so that `ui` needs no app i18n); `Escape` key on web → `onClose`.
- Set `accessibilityViewIsModal` or `role="dialog"` and `aria-modal`; focus moves into the panel on opening.
- Style: 2px outline and hard shadow like `Card`.
- Storybook/gallery: add an entry in `packages/ui/src/gallery/Gallery.tsx` if all components are listed there.

**4.2 Usage.** In `CockpitStack.tsx` these routes are shown as a sheet: `Lstb`, `CrossBorder`, `Pension`, `Catalog`, `Workdays`, `Capital`, `Rental`, `Children`, `Partner`. Implementation:
- Put these routes in a `Stack.Group` with `screenOptions={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}`.
- The wrapper of each of these routes renders `<Sheet onClose={close}>` around the screen component.
- Check in the browser (Playwright or `pnpm --filter @steuereule/mobile-web web`) that the cockpit stays visible behind the sheet. **If not:** make the sheet's background opaque and name this in the report as a deviation. Do not keep tinkering.
- `renderActiveStackRoute` (`src/navigation/guards.ts`, from Slice 1) unmounts covered stack routes. Adapt it for sheets: `CockpitHome` stays mounted when the topmost route is one of these sheet routes. Cover this with an app test (sheet open → `CockpitScreen` present in the tree).
- The TabBar is hidden while one of these routes is active (add the logic in the `tabBar` function from `AppTabs.tsx`).
- The screen components themselves get **no** sheet wrapper. `OwlModeScreen` keeps embedding them inline (do not change).

**4.3 Auto-save on close.** Helper `apps/mobile-web/src/lib/blurActiveInput.ts`:
- Web: `(document.activeElement as HTMLElement | null)?.blur()`.
- Native: `Keyboard.dismiss()`.

`close` in the sheet wrappers first calls `blurActiveInput()`, then `navigation.navigate('CockpitHome')`. This triggers the existing save on leaving a field. **No** discard dialog. A staged LStB scan (`stagedDraft`, #444) is **not** applied, because `LstbScreen` does not save with a staged draft anyway. Do not work around this.

**4.4 Tests:** Unit for `Sheet` (grabber only < 768 px, `onClose` on Escape, backdrop, close button; drag > 120 px). App test: type an amount into `lstb-bruttoarbeitslohn`, press `sheet-schliessen` without leaving the field → a PUT was sent (MSW). App test: with a staged scan draft → **no** PUT. **E2E:** extend scenario 22 with "close the sheet via the close button and via Escape, the value is saved". `breakpoint-layout` must be green at 375 px and 1280 px.

---

### SLICE 5 — Persona boosters & dual cockpit

**Allowed exception: `packages/core`, `apps/api` (interview catalog and tax estimate), scenario expectations only where the new deductions apply.**

**5.1 Derive the persona.** Pure function `derivePersonas(answers, masterData) → ReadonlySet<Persona>` in `apps/mobile-web/src/screens/cockpit/personas.ts`. `Persona = 'angestellt' | 'grenzgaenger' | 'rentner' | 'vermieter' | 'verheiratet' | 'alleinerziehend' | 'eltern'`. Rules (values from `interview.ts`):
- `angestellt`: `job` ∈ {`Angestellt`, `Beides`} and `ausland` ≠ `Ja, in die Schweiz`
- `grenzgaenger`: `ausland` = `Ja, in die Schweiz`
- `rentner`: `job` = `Rente`
- `vermieter`: answer to step `einkuenfte` ∈ {`Vermietung`, `Beides`} (`INCOME_VALUES`)
- `verheiratet`: `familienstand` = `Verheiratet`
- `eltern`: `kinder` ≠ `Nein`
- `alleinerziehend`: `eltern` and `familienstand` ∈ {`Ledig`, `Geschieden oder getrennt`, `Verwitwet`}

No new gate field, no new question in the minimal gate. Unit tests for each rule.

**5.2 Visibility.** Extend `tiles.ts` with a "Personas" column. A tile is visible in the main area if it matches one of the derived personas. **All other tiles** go into a collapsed area „Weitere Themen“ ("More topics") (`cockpit-weitere-themen`, i18n `cockpit.weitereThemen` = „Weitere Themen“). No tile is completely unreachable.

| Tile ID | Personas (main area) | Route |
| :--- | :--- | :--- |
| `lstb` | angestellt | `Lstb` |
| `ch` | grenzgaenger | `CrossBorder` |
| `rente` | rentner | `Pension` |
| `lebenslagen` | angestellt, grenzgaenger | `Catalog` lebenslagen |
| `einkuenfte` | all | `Catalog` einkuenfte |
| `sonderausgaben` | all | `Catalog` sonderausgaben |
| `arbeitsweg` | angestellt, grenzgaenger | `Workdays` |
| `kapital` | rentner | `Capital` |
| `vermietung` | vermieter | `Rental` |
| `kinder` | eltern | `Children` |
| `alleinerziehend` (new) | alleinerziehend | `Catalog` `alleinerziehend` (already exists in `CatalogScreen`) |
| `haushalt` (new) | all | `Catalog` `haushalt` (new, 5.4) |
| `gesundheit` (new) | rentner, eltern, alleinerziehend | `Catalog` `gesundheit` (new, 5.5) |

For `grenzgaenger`, the heading above the tiles is i18n `cockpit.boosterUeberschrift.nachzahlung` = „Nachzahlung senken“ ("Lower the additional payment"), otherwise `cockpit.boosterUeberschrift.erstattung` = „Erstattung erhöhen“ ("Increase the refund").

**5.3 Dual cockpit (ADR-0054).** For `verheiratet` **and** filing type "joint" (from the master data): two sections, i18n `cockpit.bereich.du` = „Du“ ("You") and `cockpit.bereich.partner` = „{{name}}“ (partner name from the master data query, **never** in the URL). The partner section has the tiles `partner-lstb` and `partner-arbeitsweg` → route `Partner` with `area` `lstb` or `arbeitsweg`; before navigating, `setPartner({ area, name })` in `ShellState`. The splitting advantage appears via the **existing** tax estimate (`tax-estimate.service.ts` already includes Person B). No new calculation. The route via the master data (`onRecordPartner`) is kept in addition.

**5.4 New catalog `haushalt` (§ 35a EStG).** In `packages/core/src/interview/interview.ts` (type `EntryId`, constant `ENTRIES` from around line 290; the entry `alleinerziehend` serves as a template), a new entry `haushalt` with these steps:
1. `haushalt-gate`: „Hattest du Kosten für Handwerker, Haushaltshilfe oder Dienstleistungen rund um die Wohnung, auch aus der Nebenkostenabrechnung?“ ("Did you have costs for tradespeople, household help or services around your home, including from the utility bill?") Values `Ja` / `Nein`. With `Nein` → done.
2. `haushalt-dienstleistung-betrag`: labor costs for household-related services and care (e.g. caretaker, stairwell cleaning, garden maintenance, winter service), in euros.
3. `haushalt-handwerker-betrag`: labor costs for tradesperson services (renovation, repair, maintenance), in euros.
4. `haushalt-minijob-betrag`: expenses for a marginally employed person in the household, in euros.

Question texts in German via i18n (`katalog.questions.<step>`), hint below step 1: „Nur Arbeits-, Maschinen- und Fahrtkosten zählen, kein Material. Bezahlt per Überweisung, nicht bar.“ ("Only labor, machine and travel costs count, no material. Paid by bank transfer, not cash.") All amounts allow `Betrag später eintragen`.

**Calculation rule** (in `packages/core/src/domains/household-services.ts`, parameters in `packages/core/src/math/tax-parameters.ts`, each with the comment `§ 35a EStG`):
- Minijob (§ 35a Abs. 1): 20 % of the expenses, at most **510 €**.
- Services and care (§ 35a Abs. 2): 20 %, at most **4.000 €**.
- Tradespeople (§ 35a Abs. 3): 20 %, at most **1.200 €**.
- The sum is a **tax reduction**: it reduces the tariff income tax, but never below 0 €. No refund beyond that.
- Calculate in cents, rounding like the rest of the core (use the existing rounding helpers).

**5.5 New catalog `gesundheit` (§ 33 EStG, medical costs).** Steps:
1. `gesundheit-gate`: „Hattest du selbst bezahlte Krankheitskosten (Zuzahlungen, Brille, Zahnersatz, Medikamente auf Rezept)?“ ("Did you have self-paid medical costs (co-payments, glasses, dentures, prescription medication)?") `Ja` / `Nein`.
2. `gesundheit-betrag`: sum of the self-borne costs after reimbursements from the health insurer, in euros.

**Calculation rule** (`packages/core/src/domains/extraordinary-burdens.ts`, parameters in `tax-parameters.ts`, comment `§ 33 Abs. 3 EStG, stufenweise nach BFH VI R 75/14`):
- Only the part above the **reasonable burden** (zumutbare Belastung) is deductible. It is calculated **in tiers** on the total amount of income (Gesamtbetrag der Einkünfte, GdE):

| GdE portion | up to 15.340 € | 15.341 € to 51.130 € | over 51.130 € |
| :--- | :--- | :--- | :--- |
| Single, no children | 5 % | 6 % | 7 % |
| Jointly assessed, no children | 4 % | 5 % | 6 % |
| 1 or 2 children | 2 % | 3 % | 4 % |
| 3 or more children | 1 % | 1 % | 2 % |

- Mandatory test case: GdE 51.835 €, 2 children → 15.340 × 2 % + 35.790 × 3 % + 705 × 4 % = 306,80 + 1.073,70 + 28,20 = **1.408,70 €** reasonable burden.
- The deductible amount reduces taxable income (like other deductions in the core; find and use the existing route).
- Where the GdE comes from: from the existing calculation in the core. If there is no GdE value you can use safely: **stop rule 4**.
- The number of children comes from the interview answer `kinder`: `1 Kind` → 1–2 children; `2 oder mehr` → **1–2 children** (the answer does not distinguish between 2 and 3+; confirmed by the product owner, do not report it as an open question).

**5.6 Pass through.** The API must store and read the entries `haushalt` and `gesundheit` like the other catalog entries. Add both values in exactly these two places: `ADMITTED_ENTRY_IDS` in `apps/api/src/interview/interview.service.ts` and the `enum` of `@ApiQuery({ name: 'eintrag' … })` in `apps/api/src/interview/interview.controller.ts`. Then regenerate the API client and commit the generated files too:
```bash
pnpm --filter @steuereule/api openapi:spec
```
```bash
pnpm --filter @steuereule/api-client generate
```
Never edit generated files in `packages/api-client/src/generated/` by hand. The tax estimate (`apps/api/src/tax-estimate/tax-estimate.service.ts` → core estimate functions) includes both results. List every estimate function you changed in the report. `CatalogScreen` gets the two new `entry` values.

**5.7 Printout.** Check with `grep -ri "haushaltsnah\|aussergewoehnlich\|außergewöhnlich" apps/api/src/printout` whether the print templates already support the forms „Haushaltsnahe Aufwendungen“ (household-related expenses) and „Außergewöhnliche Belastungen“ (extraordinary burdens).
- **If not:** create the constant `HOUSEHOLD_AND_HEALTH_BOOSTERS = false` in `apps/mobile-web/src/config/features.ts`. As long as it is `false`, the tiles `haushalt` and `gesundheit` are invisible and the tax estimate ignores both catalogs (flag additionally as a constant in the API). Reason: nothing on screen may promise something the printout does not deliver (ADR-0032). Name it in the report as the open question "Print templates for § 35a/§ 33".
- **If so:** flag `true` and write the values into the existing print fields.
- In both cases, the calculation logic and tests are fully complete.

**5.8 Tests:** Core: all limits from 5.4 (below/exactly at/above the maximum per paragraph; reduction never below 0); all 12 cells of the table from 5.5 plus the mandatory test case. Mobile: `derivePersonas` per rule; visibility per persona; „Weitere Themen“ contains all remaining tiles; dual cockpit only for married + joint; partner name not in the URL. **E2E:** scenario 04 (Weber) via the partner tiles instead of via the master data; scenario 05 (pensioner) sees `kapital` in the main area and `arbeitsweg` under „Weitere Themen“; scenario 07 (single parent) sees `alleinerziehend`. If expected amounts change as a result, **stop rule 3**, unless the flag from 5.7 is `true` and the scenario enters § 35a/§ 33 costs.

---

### SLICE 6 — Dark mode

**6.1 Token audit.** Source of the colors: `finanzo-funke-design-system/project/tokens/colors.css` (light) and `dunkel.css` (dark). Afterwards `pnpm --filter @steuereule/tokens build` builds the package `@steuereule/tokens`.
- List in the report every color from `colors.css` that has **no** value of its own in `dunkel.css`, and for each say: stays the same (justification) or new value.
- Derive new dark values only from the existing palette (no new brand colors). The lime `funke` stays the accent.
- Hard shadows (`effects.css`): in the dark they must not be black on almost black. If `dunkel.css` has no shadow value, set the shadow in the dark to the outline color (`tinte` dark) so it stays visible.
- **Contrast test** in `packages/tokens/src/contrast.test.ts`: for light **and** dark, every text-on-surface combination the app uses (at least `tinte` and `tinte2` on `grund`, `karte` and `nacht`, text on `funke`) must have a contrast ratio of at least **4,5 : 1** (WCAG formula, implement it in the test). If it fails, adjust the values in `dunkel.css`, not the test.

**6.2 Wire up.**
- `apps/mobile-web/src/lib/appearance.ts`: `type AppearancePreference = 'system' | 'light' | 'dark'`, read/write in **localStorage** key `steuereule.appearance`, every access in `try/catch`, default `system`. It is written **only** when the user changes the setting.
- `App.tsx`: `ThemeProvider mode` = preference, for `system` from `useColorScheme()` (`react-native`). `StatusBar style` = `light` in the dark, otherwise `dark`.
- `packages/ui`: check every component for fixed colors (grep for `#` and `rgba(`); replace them with theme tokens.
- `apps/mobile-web/src/icons/AppleG.tsx`: fill color `#1d1d1f` is invisible on a dark background; control it via a `color` prop from `t.color.tinte`. `GoogleG.tsx` (brand colors) stays.

**6.3 Profile.** In `ProfileScreen`, a section „Darstellung“ ("Appearance") (i18n `profil.darstellung.titel`) with three options `System` / `Immer hell` ("Always light") / `Immer dunkel` ("Always dark") (use the existing `Option` or `Chip` component), testIDs `profil-darstellung-system`, `profil-darstellung-hell`, `profil-darstellung-dunkel`. Takes effect immediately and persists after a reload.

**6.4 Tests:** Unit: preference logic (incl. blocked storage); `ThemeProvider` gets `dark` with system dark; profile selection writes the key. **E2E:** new script `e2e/responsive/dark-mode.mjs` (style like `breakpoint-layout.mjs`, register it in `e2e/package.json` as `dark-mode`): emulate `colorScheme: 'dark'`, open the cockpit, a screen, the profile, check that the body background matches the dark `grund`; choose `Immer hell`, reload, light. `no-client-persistence` must stay green. If it turns red because of `steuereule.appearance`, check whether the test flow changes the setting; the key may only be written then.

---

### SLICE 7 — Keyboard & haptics

**7.1 Keyboard.** `Input` from `@steuereule/ui` already sets `keyboardType="number-pad"` for `type="numeric"`; react-native-web turns that into `inputmode="numeric"`.
- Check with a unit test in `packages/ui` that `Input type="numeric"` renders `inputmode="numeric"` on web.
- Find all amount and number fields in `apps/mobile-web/src` (grep for `<Input` and `TextInput`) that do **not** have `type="numeric"` but expect numbers, and switch them over. List them in the report.
- Forms must stay usable with the on-screen keyboard open: screens with forms (the sheet contents from Slice 4) get `KeyboardAvoidingView` (`behavior="padding"` only on iOS, otherwise without).

**7.2 Haptics.**
```bash
pnpm --filter @steuereule/ui exec npx expo install expo-haptics
```
(If that does not work in the package: add `expo-haptics` with the version matching Expo SDK 53 to `packages/ui/package.json`; name the version in the report.)
- `packages/ui/src/lib/haptics.ts`: `hapticSelection()`, `hapticLight()`, `hapticMedium()`, `hapticSuccess()`, `hapticWarning()`. On web a **no-op** (`Platform.OS === 'web'` → return immediately, do not load `expo-haptics` at all: `await import('expo-haptics')` only on native). Off when `AccessibilityInfo.isReduceMotionEnabled()` is true or the preference is off. Always swallow errors.
- Preference: `setHapticsEnabled(boolean)` in `haptics.ts`; the app reads/writes it in **localStorage** key `steuereule.haptics` (`apps/mobile-web/src/lib/hapticsPreference.ts`, `try/catch`, write only on change) and passes it to `setHapticsEnabled` at startup.
- Integration: tapping `Option` → `hapticLight`; `TabBar` change and tax year switcher → `hapticSelection`; `Button variant="primaer"` → `hapticMedium`; tile changes to "done" → `hapticSuccess`; gate shows a conflict or saving fails → `hapticWarning`.
- Profile: switch „Haptisches Feedback“ ("Haptic feedback") (`profil-haptik`), visible **only on native platforms** (hide on web).

**7.3 Tests:** Unit: haptics is a no-op on web (the mock of `expo-haptics` is never called); on native (platform mock) `impactAsync(Medium)` is called for the primary button; not with reduce motion; preference off → not. The `inputmode="numeric"` test from 7.1. E2E: no new ones needed, all existing ones green.

---

## PART D — Completing the batch

When Slice 7 is done (or the batch was halted):
1. Add a section **„Gesamt“** ("Overall") to the report `docs/agent-prompts/443-batch-report.md`: list of the branches with the last commit hash; list of **all** open questions from all slices; which gate commands did not run locally.
2. Commit the report.
3. Push nothing.
