// Manual exploration, not a CI gate (#476): a new customer tries to fill the return through the chat
// alone, against the REAL model. It costs money (about 110,000 input tokens per run) and its result
// depends on the model, so it reports instead of asserting.
//
// Run in ATTACH mode against a stack whose API was started with a provider key, e.g.
//   AI_ADVISOR_PROVIDER=google-genai GEMINI_API_KEY=… AI_ADVISOR_REASONING=summary
//   API_ORIGIN=… WEB_ORIGIN=… DATABASE_URL=… node advisor/customer-chat-scenario.mjs
//
// Output: SCENARIO_OUT/result.json (every answer, timings, token usage, and what ended up in the
// return) plus one screenshot per turn. In the first run (11.11.2026) nothing reached the return,
// because the model guessed field names; see ADR-0064, „Nachtrag“.
import { writeFile, mkdir } from 'node:fs/promises'
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const PASSWORD = 'Sicheres-Passwort-1!'
const YEAR = 2026
const OUT = process.env.SCENARIO_OUT ?? '/tmp/customer-scenario'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TURNS = [
  'Hallo! Ich will meine Steuererklärung für 2026 machen. Ich bin angestellt, ledig und habe keine Kinder. Wie fangen wir an?',
  'Auf meiner Lohnsteuerbescheinigung steht: Bruttolohn 62.000 €, Lohnsteuer 11.800 €, Sozialversicherung 12.400 €. Trag das bitte ein.',
  'Ich fahre 38 km einfach zur Arbeit, mit dem Auto, fünf Tage die Woche.',
  'Ungefähr 60 Tage war ich im Homeoffice.',
  'Ich hatte 30 Urlaubstage und war 5 Tage krank.',
  'Ich hatte außerdem eine Fortbildung, die hat mich 850 € gekostet.',
  'Und ich habe 300 € an das Rote Kreuz gespendet.',
  'Ich heiße Erika Mustermann und meine Steuer-ID ist 12 345 678 901. Trag das bitte auch ein.',
  'Was fehlt jetzt noch, damit ich die Erklärung abgeben kann?',
]

async function main() {
  await mkdir(OUT, { recursive: true })
  const { apiOrigin, webOrigin, sql } = await startStack()
  const email = `kunde-${Date.now()}@beispiel.de`
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  const get = async (path) => {
    const res = await api.get(path)
    return res.ok() ? res.json() : { httpStatus: res.status() }
  }

  const browser = await launchBrowser()
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  await skipSplash(page, webOrigin)
  await sleep(11_000)
  await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(email)
  await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(PASSWORD)
  await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 20_000 })
  await page.getByRole('tab', { name: 'Eule' }).click()
  await page.locator('[data-testid="advisor-chat-input"]').waitFor({ state: 'visible', timeout: 15_000 })

  const log = []
  const answers = page.locator('[data-testid="advisor-assistant-message"], [data-testid="advisor-message-aborted"], [data-testid="advisor-message-failed"]')
  for (const [index, text] of TURNS.entries()) {
    const before = await answers.count()
    const started = Date.now()
    await page.locator('[data-testid="advisor-chat-input"]').fill(text)
    await page.locator('[data-testid="advisor-chat-send"]').click()
    let firstTokenMs = null
    let outcome = 'timeout'
    for (let i = 0; i < 300; i += 1) {
      if (firstTokenMs === null && (await page.locator('[data-testid="advisor-streaming-message"]').count()) > 0) firstTokenMs = Date.now() - started
      const sending = (await page.locator('[data-testid="advisor-chat-stop"]').count()) > 0
      if (!sending && (await answers.count()) > before) {
        outcome = 'answered'
        break
      }
      if (!sending && (await page.locator('[data-testid="advisor-chat-error"]').count()) > 0) {
        outcome = 'error'
        break
      }
      await sleep(200)
    }
    const durationMs = Date.now() - started
    await sleep(800)
    const last = answers.last()
    const kind = outcome === 'answered' ? await last.getAttribute('data-testid') : outcome
    const reply = outcome === 'answered' ? (await last.innerText()).replace(/\n{2,}/g, '\n').slice(0, 1400) : ''
    const error = (await page.locator('[data-testid="advisor-chat-error"]').count()) > 0 ? await page.locator('[data-testid="advisor-chat-error"]').innerText() : null
    const thought = outcome === 'answered' && (await last.locator('[data-testid="advisor-thought-toggle"]').count()) > 0 ? await last.locator('[data-testid="advisor-thought-toggle"]').innerText() : null
    const basis = (await page.locator('[data-testid="advisor-basis-mode"]').count()) > 0

    // The customer accepts what the owl proposes: every "Jetzt übernehmen" in the latest answer.
    let applied = 0
    const proposals = outcome === 'answered' ? await last.locator('[data-testid="advisor-action-card"]').count() : 0
    const twoPaths = outcome === 'answered' ? await last.locator('[data-testid="advisor-two-paths-card"]').count() : 0
    if (outcome === 'answered') {
      // A two-paths answer: the customer takes the safe path.
      const buttons = last.locator('[data-testid="advisor-action-apply-btn"], [data-testid="advisor-path-safe-apply-btn"]')
      const n = await buttons.count()
      for (let b = 0; b < n; b += 1) {
        await buttons.nth(0).click().catch(() => {})
        await sleep(1500)
        applied += 1
      }
    }
    const applyError = (await page.locator('[data-testid="advisor-chat-error"]').count()) > 0 ? await page.locator('[data-testid="advisor-chat-error"]').innerText() : null
    await page.screenshot({ path: `${OUT}/turn-${index + 1}.png` })
    log.push({ turn: index + 1, question: text, outcome: kind, firstTokenMs, durationMs, basisMode: basis, thought, proposals, twoPaths, applied, error, applyError, reply })
    console.log(`[scenario] turn ${index + 1}: ${kind}, ${durationMs} ms, proposals ${proposals}, twoPaths ${twoPaths}, applied ${applied}${basis ? ', BASIS-MODUS' : ''}${error ? `, error: ${error}` : ''}${applyError ? `, after apply: ${applyError}` : ''}`)
    // Stay under the stream throttle of ten requests a minute.
    await sleep(Math.max(0, 7000 - durationMs))
  }

  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await sleep(3000)
  await page.screenshot({ path: `${OUT}/cockpit.png`, fullPage: true })

  const state = {
    interview: await get(`/v1/steuerjahre/${YEAR}/interview`),
    lstb: await get(`/v1/steuerjahre/${YEAR}/lstb`),
    commute: await get(`/v1/steuerjahre/${YEAR}/arbeitsweg`),
    estimate: await get(`/v1/steuerjahre/${YEAR}/steuerschaetzung`),
    cockpit: await get(`/v1/steuerjahre/${YEAR}/cockpit`),
  }
  const usage = sql(`SELECT string_agg(coalesce("status",'') || ' ' || coalesce("verbrauch",'-'), E'\\n' ORDER BY m."createdAt") FROM "BeraterNachricht" m JOIN "User" u ON u.id = m."userId" WHERE u.email = '${email}' AND m."rolle" = 'assistant'`)
  await writeFile(`${OUT}/result.json`, JSON.stringify({ email, log, state, usage: String(usage) }, null, 2))
  console.log(`[scenario] written to ${OUT}/result.json`)
  await closeBrowser(browser)
  await api.dispose()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
