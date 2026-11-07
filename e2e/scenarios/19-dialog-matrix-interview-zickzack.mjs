// Scenario 19: Deep Dialog Matrix — Minimal-Gate Interview Zig-Zag & Gate Recovery
// Tests all branches, terminal/passable gates, and multi-step Back/Forward transitions in InterviewScreen.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario19(browser, webOrigin) {
  console.log('\n--- Scenario 19: Dialog Matrix — Minimal-Gate Interview Zig-Zag & Gate Recovery ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+matrix.interview.${Date.now()}@beispiel.de`,
      firstName: 'klara',
      lastName: 'Zickzack',
      taxId: '04452397686',
    },
    webOrigin,
    'scenario-19',
  )

  await selectTaxYear2025(page)
  await page.locator('[data-testid="cockpit-interview"]').click()

  // 1. Job = Selbstständig -> Terminal Gewerbe-Gate -> Back to Job
  await page.locator('[data-testid="interview-option-job-Selbstständig"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Selbstständig"]').click()
  await page.locator('text=Ehrlich: dafür sind wir noch nicht gut genug.').waitFor({ state: 'visible', timeout: 10_000 })
  if (await page.locator('text=Angestellten-Teil vorbereiten').isVisible()) {
    fail('[Scenario 19] Terminal Gewerbe-Gate must not show forward button for Selbstständig')
  }
  await page.locator('text=Zurück zur Frage').click()

  // 2. Job = Beides -> Passable Gewerbe-Gate -> Acknowledge -> Ausland (2/4) -> Back to Gate -> Back to Job
  await page.locator('[data-testid="interview-option-job-Beides"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Beides"]').click()
  const prepBtn = page.locator('text=Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')
  await prepBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await prepBtn.click()

  // On Ausland (2/4)
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  // Back on Gewerbe-Gate -> Back to Job
  await prepBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Zurück zur Frage').click()

  // 3. Job = Rente -> Directly on Ausland (no gate) -> Back to Job -> Angestellt
  await page.locator('[data-testid="interview-option-job-Rente"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Rente"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()

  // 4. Ausland = In ein anderes Land -> CH-Only Gate -> Back to Ausland -> In ein anderes Land -> Continue -> Kinder (3/4)
  await page.locator('[data-testid="interview-option-ausland-In ein anderes Land"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-In ein anderes Land"]').click()
  await page.locator('text=Ehrlich: andere Länder können wir noch nicht.').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Zurück zur Frage').click()

  await page.locator('[data-testid="interview-option-ausland-In ein anderes Land"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-In ein anderes Land"]').click()
  const chContinue = page.locator('text=Ohne Auslands-Teil weitermachen')
  await chContinue.waitFor({ state: 'visible', timeout: 10_000 })
  await chContinue.click()

  // On Kinder (3/4) -> Back to CH-Only Gate -> Back to Ausland -> Ja, in die Schweiz -> Kinder -> Back -> Nein -> Kinder
  await page.locator('[data-testid="interview-option-kinder-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await chContinue.waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Zurück zur Frage').click()

  await page.locator('[data-testid="interview-option-ausland-Ja, in die Schweiz"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Ja, in die Schweiz"]').click()
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()

  // 5. Kinder = 2 oder mehr -> Familienstand (4/4) -> Back -> 1 Kind -> Familienstand -> Back -> Nein -> Familienstand
  await page.locator('[data-testid="interview-option-kinder-2 oder mehr"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-2 oder mehr"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Verheiratet"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Geschieden oder getrennt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  await page.locator('[data-testid="interview-option-kinder-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()

  // Complete with Ledig -> must land in LstbScreen
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 19] PASS: All Interview branches, gates, and zig-zag Back/Forward transitions verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 19: Dialog Matrix — Interview Zig-Zag', runScenario19).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
