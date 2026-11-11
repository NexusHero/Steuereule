// #450 Teil 2A — navigation efficiency, before (#443) and after: 5 personas × 4 tasks.
//
//   node e2e/navigation-efficiency/measure.mjs                     # this checkout ("neu"); gate against budgets.json
//   NAV_VARIANT=baseline NAV_ROOT=<worktree at baseline/pre-443> \
//     API_ORIGIN=… WEB_ORIGIN=… DATABASE_URL=… node e2e/navigation-efficiency/measure.mjs   # the old app, no gate
//   node e2e/navigation-efficiency/measure.mjs --update-budgets    # budgets.json = measured + 10 % (D5)
//
// Tasks (the same for both variants, see docs/testing/navigation-vorher-nachher.md):
//   1 Erster Durchlauf — the persona's own scenario script of that commit, from registration to the
//     printout screen (both commits ship 01, 02, 04, 05, 07). Counted is everything the script does.
//   2 Korrektur        — from the cockpit, change the primary amount (gross wage, Lohnausweis or capital
//                        income) and get back to the cockpit.
//   3 Unterbrechung    — inside the second mask, type a value, go to Belege and back, finish the mask.
//   4 Wiedereinstieg   — inside that mask, close the browser, open the app again (the last URL),
//                        count until the same mask is on screen again.
// Writes $NAV_REPORT_DIR/<variant>.json (default /tmp/navigation-efficiency).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMeter } from './instrument.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const VARIANT = process.env.NAV_VARIANT ?? 'neu'
const ROOT = resolve(process.env.NAV_ROOT ?? join(HERE, '..', '..'))
const REPORT_DIR = process.env.NAV_REPORT_DIR ?? '/tmp/navigation-efficiency'
const PASSWORD = 'Sicheres-Passwort-1!'
const BUDGET_SLACK = 0.1

// Import the harness of the measured commit, so each variant runs with its own helpers.
const { startStack } = await import(pathToFileURL(join(ROOT, 'e2e/harness/stack.mjs')).href)
const { launchBrowser, closeBrowser } = await import(pathToFileURL(join(ROOT, 'e2e/harness/browser.mjs')).href)
const { waitForBucketHeadroom } = await import(pathToFileURL(join(ROOT, 'e2e/harness/rate-limit.mjs')).href)

/** Where each persona keeps its primary amount and which mask the interruption happens in. */
export const PERSONAS = [
  { key: 'lena', label: 'Lena (#01)', scenario: '01-lena-hoffmann-angestellt.mjs', fn: 'runScenario01', fixed: 'du+lena@beispiel.de', amount: { field: 'lstb-bruttoarbeitslohn', tile: 'lstb', old: 'tunnel' }, mask: { field: 'arbeitstage-km', tile: 'arbeitsweg', old: 'tunnel' } },
  { key: 'brenner', label: 'Brenner CH (#02)', scenario: '02-markus-brenner-grenzgaenger-ch.mjs', fn: 'runScenario02', fixed: 'du+markus@beispiel.de', amount: { field: 'ch-feld-bruttolohn-total', tile: 'ch', old: 'tunnel' }, mask: { field: 'arbeitstage-km', tile: 'arbeitsweg', old: 'tunnel' } },
  { key: 'weber', label: 'Weber Ehepaar (#04)', scenario: '04-weber-ehepaar-zusammenveranlagung.mjs', fn: 'runScenario04', fixed: 'du+thomas@beispiel.de', amount: { field: 'lstb-bruttoarbeitslohn', tile: 'lstb', old: 'tunnel' }, mask: { field: 'arbeitstage-km', tile: 'arbeitsweg', old: 'tunnel' } },
  { key: 'meyer', label: 'Meyer Rentner (#05)', scenario: '05-hans-meyer-rentner-kapital.mjs', fn: 'runScenario05', fixed: null, amount: { field: 'kapital-kapitalertraege', tile: 'kapital', old: 'cockpit-kapital' }, mask: { field: 'kapital-sparerPauschbetrag', tile: 'kapital', old: 'cockpit-kapital' } },
  { key: 'richter', label: 'Richter alleinerziehend (#07)', scenario: '07-david-richter-alleinerziehend.mjs', fn: 'runScenario07', fixed: null, amount: { field: 'lstb-bruttoarbeitslohn', tile: 'lstb', old: 'tunnel' }, mask: { field: 'arbeitstage-km', tile: 'arbeitsweg', old: 'tunnel' } },
]
export const TASKS = ['erster-durchlauf', 'korrektur', 'unterbrechung', 'wiedereinstieg']

/** The old tunnel's "next" buttons, in the order the tunnel shows them. */
const OLD_FORWARD = ['lstb-weiter', 'ch-lohnausweis-weiter', 'arbeitstage-weiter', 'kinder-weiter', 'plausibilitaet-weiter', 'veranlagungsartenvergleich-weiter', 'kapital-weiter', 'rente-weiter']
const COCKPIT = '[data-testid="cockpit-weiter"], [data-testid="cockpit-erstattung"], [data-testid="cockpit-kachel-lstb"], [data-testid="cockpit-kapital"]'

const visible = (page, id) => page.locator(`[data-testid="${id}"]`).first().isVisible().catch(() => false)

async function ids(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter((e) => e.offsetParent !== null || e.getClientRects().length > 0).map((e) => e.getAttribute('data-testid')))
}

/** Waits (a screen may still be loading) for the old tunnel's next button; null once `field` shows. */
async function forwardButton(page, field) {
  for (let waited = 0; waited < 15_000; waited += 300) {
    if (field && (await visible(page, field))) return null
    const now = await ids(page)
    const next = OLD_FORWARD.find((f) => now.includes(f))
    if (next !== undefined) return next
    await page.waitForTimeout(300)
  }
  throw new Error(`old tunnel: no way forward${field ? ` to ${field}` : ''} (${(await ids(page)).join(',')})`)
}

/** Gets from the cockpit into the mask that holds `target`. Counted (the page is metered). */
async function openMask(page, target) {
  if (VARIANT !== 'baseline') {
    await page.locator(`[data-testid="cockpit-kachel-${target.tile}"]`).click()
  } else if (target.old !== 'tunnel') {
    await page.locator(`[data-testid="${target.old}"]`).click()
  } else {
    await page.locator('[data-testid="cockpit-weiter"]').click()
    for (let guard = 0; guard < 10 && !(await visible(page, target.field)); guard++) {
      await page.waitForTimeout(400)
      if (await visible(page, target.field)) break
      const next = await forwardButton(page, target.field)
      if (next === null) break
      await page.locator(`[data-testid="${next}"]`).first().click()
    }
  }
  await page.locator(`[data-testid="${target.field}"]`).first().waitFor({ state: 'visible', timeout: 15_000 })
}

/** Leaves the mask back to the cockpit the way the variant offers it. */
async function leaveMask(page) {
  if (VARIANT !== 'baseline') {
    const close = page.locator('[data-testid="sheet-schliessen"]')
    if (await close.count()) await close.click()
    else await page.getByRole('tab', { name: 'Cockpit' }).click()
  } else {
    for (let guard = 0; guard < 10; guard++) {
      await page.waitForTimeout(400)
      const now = await ids(page)
      if (now.includes('cockpit-weiter') || now.includes('cockpit-erstattung')) return
      const next = await forwardButton(page, null).catch(() => null)
      if (next === null) break
      await page.locator(`[data-testid="${next}"]`).first().click()
    }
  }
  await page.locator(COCKPIT).first().waitFor({ state: 'visible', timeout: 15_000 })
}

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }

async function login(page, webOrigin, email) {
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', 'navigation')
  await page.goto(webOrigin, { waitUntil: 'networkidle' })
  const skip = page.getByRole('button', { name: 'Weiter zur App' })
  if (await skip.count()) await skip.click()
  await page.getByPlaceholder('du@beispiel.de').fill(email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.getByRole('button', { name: 'Einloggen' }).click()
  await page.waitForURL((u) => u.pathname.startsWith('/app'), { timeout: 15_000 })
  await page.locator('[data-testid="jahr-2025"]').click()
  await page.locator(COCKPIT).first().waitFor({ state: 'visible', timeout: 15_000 })
}

async function measurePersona(browser, stack, persona) {
  const results = {}
  const meter = createMeter()
  if (persona.fixed) stack.sql(`DELETE FROM "User" WHERE email = '${persona.fixed}'`)

  // 1 — the scenario script of this commit, metered as a whole.
  const scenario = await import(pathToFileURL(join(ROOT, 'e2e/scenarios', persona.scenario)).href)
  meter.reset()
  await scenario[persona.fn](meter.wrapBrowser(browser), stack.webOrigin, stack.sql)
  results['erster-durchlauf'] = meter.read()
  const email = persona.fixed ?? meter.lastEmail()
  if (!email) throw new Error(`${persona.key}: could not tell which account the scenario created`)
  stack.sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

  const fresh = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const raw = await ctx.newPage()
    await login(raw, stack.webOrigin, email)
    return { ctx, page: await meter.wrapPage(raw) }
  }

  // 2 — Korrektur: amount + 1.000 €, back to the cockpit.
  {
    const { ctx, page } = await fresh()
    meter.reset()
    const started = Date.now()
    await openMask(page, persona.amount)
    const maskOpenMs = Date.now() - started
    const field = page.locator(`[data-testid="${persona.amount.field}"]`).first()
    const before = Number((await field.inputValue()).replace(/\D/g, '')) || 40_000
    await field.fill(String(before + 1_000))
    await field.blur()
    await leaveMask(page)
    results.korrektur = { ...meter.read(), maskOpenMs }
    await ctx.close()
  }

  // 3 — Unterbrechung: start inside the mask, type, Belege and back, finish.
  {
    const { ctx, page } = await fresh()
    await openMask(page, persona.mask)
    meter.reset()
    const value = '23'
    const field = () => page.locator(`[data-testid="${persona.mask.field}"]`).first()
    await field().fill(value)
    if (await page.locator('[data-testid="sheet-schliessen"]').count()) await page.locator('[data-testid="sheet-schliessen"]').click()
    await page.getByRole('tab', { name: 'Belege' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: 'Cockpit' }).click()
    await page.waitForTimeout(800)
    if (!(await visible(page, persona.mask.field))) await openMask(page, persona.mask)
    if ((await field().inputValue()).replace(/\D/g, '') !== value) await field().fill(value)
    await field().blur()
    await leaveMask(page)
    results.unterbrechung = meter.read()
    await ctx.close()
  }

  // 4 — Wiedereinstieg: inside the mask, close the browser, open the last URL again.
  {
    const { ctx, page } = await fresh()
    await openMask(page, persona.mask)
    const url = page.url()
    const storage = await ctx.storageState()
    await ctx.close()
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: storage })
    const page2 = await meter.wrapPage(await ctx2.newPage())
    meter.reset()
    await page2.goto(url, { waitUntil: 'networkidle' })
    const skip = page2.getByRole('button', { name: 'Weiter zur App' })
    if (await skip.count()) await skip.click()
    if (!(await page2.locator(`[data-testid="${persona.mask.field}"]`).first().isVisible().catch(() => false))) {
      const year = page2.locator('[data-testid="jahr-2025"]')
      await page2.locator(COCKPIT).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
      if (await year.count()) await year.click()
      await openMask(page2, persona.mask)
    }
    results.wiedereinstieg = meter.read()
    await ctx2.close()
  }
  return results
}

/** budgets.json: interactions per persona × task, measured + 10 % (D5), rounded up. */
export function budgetsFrom(report) {
  const out = {}
  for (const [persona, tasks] of Object.entries(report.personas)) {
    out[persona] = {}
    for (const [task, sample] of Object.entries(tasks)) out[persona][task] = Math.ceil(sample.interactions * (1 + BUDGET_SLACK))
  }
  return out
}

export function checkBudgets(report, budgets) {
  const violations = []
  for (const [persona, tasks] of Object.entries(budgets)) {
    for (const [task, budget] of Object.entries(tasks)) {
      const got = report.personas[persona]?.[task]?.interactions
      if (got === undefined) violations.push(`${persona}/${task}: not measured`)
      else if (got > budget) violations.push(`${persona}/${task}: ${got} interactions > budget ${budget}`)
    }
  }
  return violations
}

async function main() {
  const only = process.env.NAV_ONLY
  const stack = await startStack()
  const browser = await launchBrowser()
  const report = { variant: VARIANT, root: ROOT, measuredAt: new Date().toISOString(), personas: {} }
  try {
    for (const persona of PERSONAS.filter((p) => !only || p.key === only)) {
      console.log(`[navigation] ${VARIANT} — ${persona.label}`)
      report.personas[persona.key] = await measurePersona(browser, stack, persona)
      for (const task of TASKS) {
        const s = report.personas[persona.key][task]
        console.log(`[navigation]   ${task.padEnd(17)} ${String(s.interactions).padStart(4)} interactions (${s.clicks} clicks, ${s.keys} keys), ${s.screens} screens, ${(s.ms / 1000).toFixed(1)} s${s.maskOpenMs ? `, mask open ${s.maskOpenMs} ms` : ''}`)
      }
    }
  } finally {
    await closeBrowser(browser)
    await stack.stop?.()
  }
  await mkdir(REPORT_DIR, { recursive: true })
  await writeFile(join(REPORT_DIR, `${VARIANT}.json`), JSON.stringify(report, null, 2) + '\n')

  if (VARIANT === 'baseline') return
  const budgetsPath = join(HERE, 'budgets.json')
  if (process.argv.includes('--update-budgets')) {
    await writeFile(budgetsPath, JSON.stringify(budgetsFrom(report), null, 2) + '\n')
    console.log(`[navigation] budgets written to ${budgetsPath}`)
    return
  }
  const budgets = JSON.parse(await readFile(budgetsPath, 'utf8'))
  const violations = checkBudgets(report, only ? { [only]: budgets[only] } : budgets)
  if (violations.length > 0) {
    for (const v of violations) console.error(`[navigation] ❌ ${v}`)
    process.exit(1)
  }
  console.log('[navigation] PASS — every persona and task within its budget (measured + 10 %).')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
