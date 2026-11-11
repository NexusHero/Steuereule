// #450 5G/5J — the rarely chosen answers, driven through the real screens: widowed, the two
// § 24b household questions, the Gewerbe and Schweiz-only gates (passable), the Schweiz residence
// and a child-free divorced person. Every pick is checked against what the API stored. The
// interview pairs this adds are exactly the ones `scripts/checks/e2e-coverage-ratchet.mjs` listed.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, browserLogin, until } from '../harness/api-account.mjs'

const TAG = 'rare-branches'
const YEAR = 2026

/** Clicks through whatever question is on screen until none of `picks`' steps is shown any more. */
async function drive(page, picks) {
  const stepIds = Object.keys(picks)
  for (let guard = 0; guard < 20; guard++) {
    await page.waitForTimeout(400)
    const visible = await page.evaluate(
      ({ steps }) => {
        const ids = [...document.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid'))
        // The Schweiz mask has its own testIDs (ch-wohnsitz-*, ch-tage-*).
        const own = { 'ch-wohnsitz': (id) => id.startsWith('ch-wohnsitz-'), 'ch-nichtrueckkehrtage': (id) => id === 'ch-tage-input' }
        return (
          steps.find((s) =>
            own[s] !== undefined
              ? ids.some(own[s])
              : ids.some((id) => id.startsWith(`interview-option-${s}-`) || id.startsWith(`katalog-option-${s}-`) || id === `katalog-input-${s}`),
          ) ?? null
        )
      },
      { steps: stepIds },
    )
    if (visible === null) return
    const value = picks[visible]
    if (visible === 'ch-wohnsitz') {
      await page.locator(`[data-testid="ch-wohnsitz-${String(value).toLowerCase()}"]`).click()
      continue
    }
    if (visible === 'ch-nichtrueckkehrtage') {
      await page.locator('[data-testid="ch-tage-input"]').fill(String(value))
      await page.locator('[data-testid="ch-tage-weiter"]').click()
      continue
    }
    const input = page.locator(`[data-testid="katalog-input-${visible}"]`)
    if ((await input.count()) > 0) {
      await input.fill(String(value))
      await page.locator(`[data-testid="katalog-submit-${visible}"]`).click()
    } else {
      const gate = page.locator(`[data-testid="interview-option-${visible}-${value}"]`)
      const option = (await gate.count()) > 0 ? gate : page.locator(`[data-testid="katalog-option-${visible}-${value}"]`)
      await option.click()
    }
  }
  fail(`the questions did not end after 20 picks (${stepIds.join(', ')})`)
}

async function stored(api, step) {
  return (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/interview`)).answers?.[step]
}

async function expectStored(api, expected) {
  for (const [step, value] of Object.entries(expected)) await until(() => stored(api, step), String(value), `"${step}" must be stored as ${value}`)
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const personas = [
      {
        name: 'widowed with a child, then the § 24b household questions (another adult: yes, household community: no)',
        gate: { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Verwitwet' },
        followUps: [['alleinerziehend', { 'ae-weitere-person': 'Ja', 'ae-haushaltsgemeinschaft': 'Nein' }]],
      },
      {
        name: 'divorced with two children; the household questions the other way round',
        gate: { job: 'Angestellt', ausland: 'Nein', kinder: '2 oder mehr', familienstand: 'Geschieden oder getrennt' },
        followUps: [['alleinerziehend', { 'ae-weitere-person': 'Nein', 'ae-haushaltsgemeinschaft': 'Ja' }]],
      },
      {
        name: 'employed and self-employed: the Gewerbe gate is passable',
        gate: { job: 'Beides', gewerbe: 'weiter', ausland: 'In ein anderes Land', 'ch-only': 'weiter', kinder: 'Nein', familienstand: 'Ledig' },
        followUps: [],
      },
      {
        name: 'Grenzgänger who lives in Switzerland',
        gate: { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Ledig' },
        followUps: [['schweiz', { 'ch-wohnsitz': 'Schweiz', 'ch-nichtrueckkehrtage': '4' }]],
      },
      {
        name: 'Grenzgänger who lives in Germany',
        gate: { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Ledig' },
        followUps: [['schweiz', { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }]],
      },
    ]

    for (const persona of personas) {
      const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
      const ctx = await newContextAtBreakpoint(browser, 'l')
      const page = await ctx.newPage()
      guardAgainst429(page, fail, '/api/auth/')
      await browserLogin(page, webOrigin, user.email, TAG)
      await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/interview`, { waitUntil: 'networkidle' })
      await drive(page, persona.gate)
      await expectStored(user.api, Object.fromEntries(Object.entries(persona.gate).filter(([step]) => !['gewerbe', 'ch-only'].includes(step))))
      for (const [entry, picks] of persona.followUps) {
        await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/${entry === 'schweiz' ? 'schweiz' : `katalog/${entry}`}`, { waitUntil: 'networkidle' })
        await drive(page, picks)
        await expectStored(user.api, picks)
      }
      console.log(`[${TAG}] ✅ ${persona.name}`)
      await ctx.close()
      await user.api.dispose()
    }
    // The occupation group (asked in the Eule tab): every one of the eight values, changed one after the other.
    {
      const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
      const ctx = await newContextAtBreakpoint(browser, 'l')
      const page = await ctx.newPage()
      guardAgainst429(page, fail, '/api/auth/')
      await browserLogin(page, webOrigin, user.email, TAG)
      await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
      const professions = [
        ['beruf', 'IT & Software'],
        ['beruf', 'Pflege & Gesundheit'],
        ['beruf', 'Lehrkraft & Erziehung'],
        ['beruf', 'Handwerk & Technik'],
        ['beruf', 'Büro & Verwaltung'],
        ['beruf', 'Vertrieb & Außendienst'],
        ['beruf', 'Ausbildung oder Studium'],
        ['beruf', 'Etwas anderes'],
      ].map(([, value]) => value)
      for (const [index, profession] of professions.entries()) {
        if (index > 0) await page.locator('[data-testid="beruf-aendern"]').click()
        await page.locator(`[data-testid="beruf-${profession}"]`).click()
        await page.locator('[data-testid="beruf-summary"]').waitFor({ state: 'visible', timeout: 10_000 })
        await expectStored(user.api, { beruf: profession })
      }
      console.log(`[${TAG}] ✅ Berufsprofil — all ${professions.length} groups can be chosen and changed`)
      await ctx.close()
      await user.api.dispose()
    }
    console.log(`[${TAG}] PASS — #450 5G/5J rare answer branches verified in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
