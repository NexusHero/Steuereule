// Scenario 12: Carlos Santos (Expat with non-Swiss foreign income -> CH-Only Gate)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  answerBasis,
  leaveStrom,
  waitForStromStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario12(browser, webOrigin) {
  console.log('\n--- Scenario 12: Carlos Santos (Expat with non-Swiss foreign income -> CH-Only Gate) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+carlos.santos.${Date.now()}@beispiel.de`,
      firstName: 'Carlos',
      lastName: 'Santos',
      taxId: '67201938455',
    },
    webOrigin,
    'scenario-12',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom's basis page (ADR-0089) shows the CH-only gate inline under the foreign answer; the
  // remaining questions stay open, and Weiter continues without the foreign part.
  await waitForStromStep(page, 'basis')
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-In ein anderes Land"]').click()
  const gate = page.locator('[data-testid="strom-hinweis-ch-only"]')
  await gate.waitFor({ state: 'visible', timeout: 10_000 })
  await gate.locator('text=Ehrlich: andere Länder können wir noch nicht.').waitFor({ state: 'visible', timeout: 10_000 })
  await gate.locator('text=Jedes Land hat sein eigenes Abkommen mit eigenen Regeln').waitFor({ state: 'visible', timeout: 10_000 })
  await answerBasis(page, { job: 'Angestellt', ausland: 'In ein anderes Land', kinder: 'Nein', familienstand: 'Ledig' })

  await waitForStromStep(page, 'lohnsteuerbescheinigung')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('60000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('11000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('12000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').blur()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('[data-testid="lstb-weiter"]').click()

  await waitForStromStep(page, 'arbeitsweg')
  await leaveStrom(page)
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await assertCockpitEstimate(page, 'Scenario 12', { direction: 'Erstattung' })
  console.log('[Scenario 12] PASS: CH-Only Gate boundary and continuation flow verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 12: Carlos Santos (CH-Only Gate)', runScenario12).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
