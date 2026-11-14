// Scenario 15: Martina Vogt (Cross-Combination Hybrid "Beides" + Swiss Expat "Ja, in die Schweiz" + Verheiratet + 1 Kind)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  answerBasis,
  chooseTopics,
  leaveStrom,
  waitForStromStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario15(browser, webOrigin) {
  console.log('\n--- Scenario 15: Cross-Combination Hybrid + Swiss Expat (Beides + Schweiz + Verheiratet + 1 Kind) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+hybrid-ch-${Date.now()}@beispiel.de`,
      firstName: 'Martina',
      lastName: 'Vogt',
      taxId: '04452397686',
      taxNumber: '181/140/01235',
    },
    webOrigin,
    'scenario-15',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()

  // The Strom's basis page (ADR-0089): „Beides“ shows the passable Gewerbe-Gate inline, the Swiss
  // answer and the partner's work (ADR-0088) are on the same page.
  await waitForStromStep(page, 'basis')
  await page.locator('[data-testid="interview-option-job-Beides"]').click()
  await page.locator('[data-testid="strom-hinweis-gewerbe"]').waitFor({ state: 'visible', timeout: 10_000 })
  await answerBasis(page, { job: 'Beides', ausland: 'Ja, in die Schweiz', kinder: '1 Kind', familienstand: 'Verheiratet', 'partner-job': 'Rente' })

  await waitForStromStep(page, 'schweiz')
  await page.locator('[data-testid="ch-wohnsitz-deutschland"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-wohnsitz-deutschland"]').click()

  await page.locator('[data-testid="ch-tage-input"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-tage-input"]').fill('0')
  await page.locator('[data-testid="ch-tage-weiter"]').click()

  await page.locator('[data-testid="ch-lohnausweis-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-lohnausweis-weiter"]').click()

  await waitForStromStep(page, 'arbeitsweg')
  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill('10')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // The child is entered later: the step is passed over, the selection names nothing.
  await waitForStromStep(page, 'kinder')
  await page.locator('[data-testid="kinder-weiter"]').click()
  await chooseTopics(page, [])
  await waitForStromStep(page, 'fertig')
  await leaveStrom(page)

  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 15] PASS: Hybrid + Swiss Expat combined flow verified without dead-ends.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 15: Martina Vogt (Hybrid + Swiss Expat)', runScenario15).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
