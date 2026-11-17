// Step sequences that several persona scenarios walk in exactly the same way: opening the page and
// registering, the Lohnsteuerbescheinigung and way-to-work steps of the Strom, and the look at the
// submission from the cockpit. What a persona answers stays in its scenario; these take it as data.
import { newContextAtBreakpoint, guardAgainst429, fail, registerAndOnboard, waitForStromStep, leaveStrom } from './scenario-harness.mjs'

/**
 * Opens a 429-guarded page at `breakpoint` and registers the persona through the UI.
 * `account` is what `registerAndOnboard` takes; `callerLabel` names the scenario in the pacing log.
 */
export async function startPersona(browser, webOrigin, callerLabel, account, breakpoint = 'l', contextOptions = {}) {
  const ctx = await newContextAtBreakpoint(browser, breakpoint, contextOptions)
  const page = await ctx.newPage()
  guardAgainst429(page, fail)
  await registerAndOnboard(page, account, webOrigin, callerLabel)
  return { ctx, page }
}

/** Waits for a notice of the basis page (by its testID) and for each text it must say; returns the notice. */
export async function waitForStromNotice(page, testId, texts) {
  const notice = page.locator(`[data-testid="${testId}"]`)
  await notice.waitFor({ state: 'visible', timeout: 10_000 })
  for (const text of texts) await notice.locator(`text=${text}`).waitFor({ state: 'visible', timeout: 10_000 })
  return notice
}

/** Types the three amounts of the Lohnsteuerbescheinigung step; the step stays open. */
export async function fillLstb(page, { grossWage, wageTax, socialSecurity }) {
  await waitForStromStep(page, 'lohnsteuerbescheinigung')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill(String(grossWage))
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill(String(wageTax))
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill(String(socialSecurity))
}

/** The Lohnsteuerbescheinigung step: its three amounts, then Weiter. */
export async function completeLstb(page, amounts) {
  await fillLstb(page, amounts)
  await page.locator('[data-testid="lstb-weiter"]').click()
}

/** The Lohnsteuerbescheinigung step, leaving the last field and letting its save settle before Weiter. */
export async function completeLstbSettled(page, amounts) {
  await fillLstb(page, amounts)
  await page.locator('[data-testid="lstb-sozialversicherung"]').blur()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('[data-testid="lstb-weiter"]').click()
}

/** The way-to-work step with every field: absences, home office, holiday region, distance, transport, workplace. */
export async function completeCommute(page, { vacationDays, sickDays, homeOfficeDays, region, oneWayKm, transport, workplace }) {
  await waitForStromStep(page, 'arbeitsweg')
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill(String(vacationDays))
  await page.locator('[data-testid="arbeitstage-krank"]').fill(String(sickDays))
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(homeOfficeDays))
  await page.locator(`[data-testid="feiertage-region-${region}"]`).click()
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(oneWayKm))
  await page.locator(`[data-testid="arbeitstage-transport-${transport}"]`).click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill(workplace)
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
}

/** The way-to-work step with the distance alone. */
export async function completeCommuteDistance(page, oneWayKm) {
  await waitForStromStep(page, 'arbeitsweg')
  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(oneWayKm))
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
}

/** Pauses the Strom at the way-to-work step and brings the Cockpit tab to the front. */
export async function pauseStromAtCommute(page) {
  await waitForStromStep(page, 'arbeitsweg')
  await leaveStrom(page)
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('tab', { name: 'Cockpit' }).click()
}

/** Opens the submission from the cockpit, fails unless the printout is open, and goes back. `subject` ends the failure message. */
export async function assertPrintoutOpen(page, subject) {
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail(`Expected abgabe-zum-ausdruck enabled for ${subject}`)
  await page.locator('[data-testid="abgabe-zurueck"]').click()
}

/**
 * Opens the submission from the cockpit, fails unless the printout still waits, and goes back.
 * UX review H3: „Verheiratet“ in the interview already set up the joint return, so the printout waits for the
 * Veranlagungsart comparison (or its skip) instead of being open before the master data.
 */
export async function assertPrintoutWaitsForComparison(page, subject) {
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-vergleich-ueberspringen"]').waitFor({ state: 'visible', timeout: 10_000 })
  if (!(await printBtn.isDisabled())) fail(`Expected abgabe-zum-ausdruck to wait for the comparison in ${subject}`)
  await page.locator('[data-testid="abgabe-zurueck"]').click()
}

/** Types each `[testId, value]` of the capital mask and leaves the field (it saves on blur), then presses the mask's Weiter. */
export async function saveCapitalFields(page, fields) {
  for (const [id, value] of fields) {
    await page.locator(`[data-testid="${id}"]`).fill(value)
    await page.locator(`[data-testid="${id}"]`).blur()
  }
  await page.waitForTimeout(400)
  await page.locator('[data-testid="kapital-weiter"]').click()
}
