// Scenario 17: Maximilian Allesgeber (Full-Spectrum Maximal Catalog: All "Ja" with Follow-ups in Lebenslagen)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fail,
  answerBasis,
  fillTopic,
  leaveStrom,
  waitForStromStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstb, completeCommuteDistance } from './helpers/persona-steps.mjs'

export async function runScenario17(browser, webOrigin) {
  console.log('\n--- Scenario 17: Maximal Catalog (All "Ja" in Lebenslagen with follow-ups) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-17', {
    email: `du+maximal-${Date.now()}@beispiel.de`, firstName: 'Maximilian', lastName: 'Allesgeber', taxId: '04452397686', taxNumber: '181/140/01235',
  }, 's')

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom (ADR-0089): every Lebenslage chosen on the one selection page, then one page each.
  await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })

  await completeLstb(page, { grossWage: '70000', wageTax: '14000', socialSecurity: '13000' })

  await completeCommuteDistance(page, '10')

  await waitForStromStep(page, 'auswahl')
  // The rare topics (Abfindung, Weitere Einkünfte, Vorauszahlungen) wait behind „Mehr anzeigen“.
  if (await page.locator('[data-testid="strom-thema-abfindung"]').isVisible()) fail('[Scenario 17] Abfindung should be behind „Mehr anzeigen“')
  await page.locator('[data-testid="strom-mehr"]').click()
  await page.locator('[data-testid="strom-thema-abfindung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-thema-einkuenfte"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-thema-vorauszahlungen-gate"]').waitFor({ state: 'visible', timeout: 10_000 })
  // Every Lebenslage with the answer it stands for: Ja, or the kind for the side job.
  const chosen = { dhf: 'Ja', umzug: 'Ja', abfindung: 'Ja', lohnersatz: 'Ja', nebenjob: 'Minijob' }
  for (const topic of Object.keys(chosen)) {
    await page.locator(`[data-testid="strom-thema-${topic}"]`).click()
  }
  // The side job is chosen with its kind: Weiter without one names what is missing.
  await page.locator('[data-testid="strom-arten-nebenjob"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-weiter"]').click()
  await page.locator('[data-testid="strom-fehlt-art-nebenjob"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator(`[data-testid="strom-art-nebenjob-${chosen.nebenjob}"]`).click()
  await page.locator('[data-testid="strom-weiter"]').click()

  await fillTopic(page, 'umzug', { 'umzug-kosten': 3500 })
  await fillTopic(page, 'doppelte-haushaltsfuehrung', { 'dhf-miete': 1200 })
  await fillTopic(page, 'lohnersatz', { 'lohnersatz-betrag': 4000 })
  await fillTopic(page, 'abfindung', { 'abfindung-betrag': 25000 })

  await waitForStromStep(page, 'fertig')
  for (const slug of ['umzug', 'doppelte-haushaltsfuehrung', 'lohnersatz', 'abfindung']) {
    await page.locator(`[data-testid="strom-uebernommen-${slug}"]`).waitFor({ state: 'visible', timeout: 10_000 })
  }
  await page.locator('[data-testid="strom-fertig-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await leaveStrom(page)
  await page.locator('[data-testid="cockpit-kachel-lebenslagen-status"]', { hasText: 'Erledigt' }).waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 17] PASS: All Lebenslagen chosen on one selection page, every amount on its own page, summary complete.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 17: Maximilian Allesgeber (Maximal Catalog)', runScenario17).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
