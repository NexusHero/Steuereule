# Navigation before/after (#450 part 2A)

As of: 11.11.2026. **Before** = tag `baseline/pre-443` (commit `1990ed3`, the tunnel before #443), **after** = `main` with #443 (hub cockpit, sheets, URL per screen). Measured with `e2e/navigation-efficiency/measure.mjs` against both states, each with its own API and web build; raw data in `e2e/navigation-efficiency/results/`.

## What is measured

| Task | Flow |
| :--- | :--- |
| First run | The persona's scenario script from the respective commit (01, 02, 04, 05, 07), from registration to the printout. Both commits have their own scripts for their own UI. |
| Correction | From the cockpit, change the main amount (gross wage; for the Grenzgänger (cross-border commuter) the gross wage in the Lohnausweis (Swiss salary certificate); for the pensioner the capital income) and back to the cockpit. |
| Interruption | In the second screen (working days; for the pensioner capital) type a value, switch to documents, go back, complete the screen. |
| Re-entry | In this screen, close the browser, reopen the last open address, count until the same screen is back. |

- **Interactions:** clicks plus key presses (an input counts one character per digit). Opening the address does not count.
- **Screens:** newly mounted screens and sheets (`screen-container`). The old app had the same URL for all screens, so screens are not counted via URLs.
- **Time:** wall clock of the automated run, not human pace. **Slowest interaction:** the browser's Event Timing (approximation of INP).

## Result

| Persona | Task | Interactions before | after | Δ | Screens before | after | Time before (s) | after (s) | slowest interaction before (ms) | after (ms) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lena (#01) | First run | 257 | 261 | +4 | 30 | 30 | 15.6 | 16.1 | 80 | 80 |
| Lena (#01) | Correction | 10 | 7 | -3 | 10 | 2 | 2.7 | 0.1 | 32 | 48 |
| Lena (#01) | Interruption | 11 | 9 | -2 | 11 | 3 | 4.1 | 1.6 | 24 | 32 |
| Lena (#01) | Re-entry | 3 | 0 | -3 | 11 | 5 | 1.7 | 0.8 | 56 | 0 |
| Brenner CH (#02) | First run | 511 | 514 | +3 | 27 | 25 | 5.6 | 6.3 | 80 | 80 |
| Brenner CH (#02) | Correction | 9 | 8 | -1 | 7 | 3 | 1.8 | 0.2 | 24 | 32 |
| Brenner CH (#02) | Interruption | 9 | 9 | 0 | 8 | 3 | 3.2 | 1.6 | 24 | 32 |
| Brenner CH (#02) | Re-entry | 3 | 0 | -3 | 10 | 5 | 1.7 | 0.8 | 56 | 0 |
| Weber married couple (#04) | First run | 522 | 528 | +6 | 42 | 36 | 6.8 | 11.5 | 80 | 2296 |
| Weber married couple (#04) | Correction | 10 | 7 | -3 | 10 | 2 | 2.7 | 0.1 | 32 | 48 |
| Weber married couple (#04) | Interruption | 11 | 9 | -2 | 11 | 3 | 4.1 | 1.6 | 24 | 32 |
| Weber married couple (#04) | Re-entry | 3 | 0 | -3 | 11 | 5 | 1.7 | 0.8 | 56 | 0 |
| Meyer pensioner (#05) | First run | 210 | 212 | +2 | 26 | 25 | 5.9 | 5.6 | 80 | 56 |
| Meyer pensioner (#05) | Correction | 6 | 6 | 0 | 3 | 2 | 0.9 | 0.1 | 32 | 32 |
| Meyer pensioner (#05) | Interruption | 8 | 7 | -1 | 5 | 3 | 2.3 | 1.6 | 32 | 32 |
| Meyer pensioner (#05) | Re-entry | 2 | 0 | -2 | 6 | 5 | 0.8 | 0.8 | 56 | 0 |
| Richter single parent (#07) | First run | 216 | 219 | +3 | 28 | 25 | 3.7 | 4.2 | 80 | 72 |
| Richter single parent (#07) | Correction | 10 | 7 | -3 | 10 | 2 | 2.7 | 0.1 | 32 | 32 |
| Richter single parent (#07) | Interruption | 11 | 9 | -2 | 11 | 3 | 4.1 | 1.5 | 24 | 48 |
| Richter single parent (#07) | Re-entry | 3 | 0 | -3 | 11 | 5 | 1.7 | 0.7 | 48 | 0 |


## Reading the results

- **First run:** afterwards 2 to 6 more interactions. That is the expected price for „Nächster Schritt“ ("Next step") instead of automatically jumping ahead (note in the ticket).
- **Correction, interruption, re-entry:** afterwards fewer interactions and clearly fewer screens. On re-entry the deep link lands directly in the screen (0 interactions instead of 2 to 3).
- **Pensioner (#05):** The capital screen was already reachable directly from the cockpit before, so there is hardly any difference for the correction.
- **Limits:** Same device, local stack, one measurement per cell. Times fluctuate, so only the interactions are a gate.

## Budgets (D5)

`e2e/navigation-efficiency/budgets.json` = measured interactions after + 10 %, rounded up. The step "Navigation efficiency budgets" in the job "Browser gates" measures the new state on every PR and fails when a persona task exceeds its budget. After an intended change: `node e2e/navigation-efficiency/measure.mjs --update-budgets` and the reason in the PR.

## Re-measuring the before state

```bash
git worktree add ../steuereule-alt baseline/pre-443
# dort: pnpm install, eigene DB migrieren, API bauen und starten, Web exportieren und ausliefern (andere Ports)
NAV_VARIANT=baseline NAV_ROOT=../steuereule-alt API_ORIGIN=… WEB_ORIGIN=… DATABASE_URL=… node e2e/navigation-efficiency/measure.mjs
node e2e/navigation-efficiency/compare.mjs /tmp/navigation-efficiency/baseline.json /tmp/navigation-efficiency/neu.json
```
