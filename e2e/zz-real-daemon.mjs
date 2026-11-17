// Local, untracked helper for the real-data run: performs a short list of named steps in a real
// browser (the user's own flows: log in, open a tab, attach files, send a chat message, read the
// answer) and appends everything it did and saw to a transcript. No free-form code: a step is one
// of the verbs below.
//
//   node zz-real-step.mjs steps.json
//
// Env: WEB_ORIGIN, REAL_PROFILE (browser profile dir, keeps the login), REAL_OUT (transcript + shots).
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'

const WEB = process.env.WEB_ORIGIN
const OUT = process.env.REAL_OUT
const PROFILE = process.env.REAL_PROFILE
if (!WEB || !OUT || !PROFILE) throw new Error('WEB_ORIGIN, REAL_OUT and REAL_PROFILE are required')

await mkdir(`${OUT}/shots`, { recursive: true })
const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, acceptDownloads: true, viewport: { width: 1280, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const tid = (id) => page.locator(`[data-testid="${id}"]`)
let echo = []
const log = async (line) => {
  echo.push(line)
  console.log(line)
  await appendFile(`${OUT}/transcript.md`, `${line}\n`)
}

/** Evidence for the step just done: the screen as it is, and the owl's last answer in full. */
let proofNo = (await readdir(`${OUT}/shots`)).filter((name) => /^\d{3}-/.test(name)).length
async function proof(label) {
  proofNo += 1
  const name = `${String(proofNo).padStart(3, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`
  await page.screenshot({ path: `${OUT}/shots/${name}.png` })
  const answers = page.locator('[data-testid="advisor-assistant-message"]')
  if ((await answers.count()) > 0) await answers.last().screenshot({ path: `${OUT}/shots/${name}-antwort.png` }).catch(() => {})
  await log(`\n> Beweis: shots/${name}.png`)
}

const ANSWERS = '[data-testid="advisor-assistant-message"], [data-testid="advisor-message-aborted"], [data-testid="advisor-message-failed"]'

/** Waits until the owl has stopped writing, then returns the last answer's text. */
async function awaitAnswer(before, timeoutSec) {
  const answers = page.locator(ANSWERS)
  for (let i = 0; i < timeoutSec * 2; i += 1) {
    const sending = (await tid('advisor-chat-stop').count()) > 0 || (await tid('advisor-streaming-message').count()) > 0
    if (!sending && (await answers.count()) > before) return (await answers.last().innerText()).trim()
    await sleep(500)
  }
  return null
}

function target(step) {
  if (step.testId) return tid(step.testId).nth(step.nth ?? 0)
  if (step.role) return page.getByRole(step.role, { name: step.name, exact: step.exact ?? false }).nth(step.nth ?? 0)
  if (step.placeholder) return page.getByPlaceholder(step.placeholder).nth(step.nth ?? 0)
  if (step.label) return page.getByLabel(step.label).nth(step.nth ?? 0)
  return page.getByText(step.text, { exact: step.exact ?? false }).nth(step.nth ?? 0)
}

const VERBS = {
  async open(step) {
    await page.goto(step.path ? `${WEB}${step.path}` : WEB, { waitUntil: 'networkidle' })
  },
  /** Logs in with the account from the environment and steps past the welcome screen. */
  async login() {
    await page.goto(WEB, { waitUntil: 'networkidle' })
    const skip = page.getByRole('button', { name: 'Weiter zur App', exact: true })
    if (await skip.count()) await skip.click()
    const email = page.getByPlaceholder('du@beispiel.de')
    if (await email.count()) {
      await email.fill(process.env.REAL_EMAIL)
      await page.getByPlaceholder('••••••••').fill(process.env.REAL_PW)
      await page.getByRole('button', { name: 'Einloggen', exact: true }).click()
    }
    const onward = page.getByRole('button', { name: 'Weiter', exact: true })
    await onward.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    if (await onward.count()) await onward.click()
    await page.waitForURL((url) => url.pathname.startsWith('/app'), { timeout: 20_000 })
  },
  async click(step) {
    await target(step).click({ timeout: step.timeoutMs ?? 10_000 })
  },
  async fill(step) {
    await target(step).fill(step.value, { timeout: 10_000 })
  },
  async press(step) {
    await page.keyboard.press(step.key)
  },
  async wait(step) {
    await sleep(step.ms)
  },
  /** Chooses files in a file input, the way the file dialog would. */
  async upload(step) {
    await tid(step.testId).setInputFiles(step.files)
  },
  /** Types a chat message, sends it, waits for the owl and logs both sides. */
  async say(step) {
    const before = await page.locator(ANSWERS).count()
    await tid('advisor-chat-input').fill(step.text)
    await tid('advisor-chat-send').click()
    await log(`\n### Ich\n${step.text}`)
    const answer = await awaitAnswer(before, step.timeoutSec ?? 240)
    await log(`\n### Eule\n${answer ?? '(keine Antwort innerhalb der Wartezeit)'}`)
  },
  /** Waits for an answer that something other than a message started (an attached document). */
  async awaitAnswer(step) {
    const answer = await awaitAnswer(step.before ?? (await page.locator(ANSWERS).count()) - 0, step.timeoutSec ?? 240)
    await log(`\n### Eule\n${answer ?? '(keine Antwort innerhalb der Wartezeit)'}`)
  },
  /** Logs the visible text of an element (or of the page). */
  async read(step) {
    const locator = step.testId ? tid(step.testId) : page.locator(step.selector ?? 'body')
    const count = await locator.count()
    const texts = []
    for (let i = 0; i < Math.min(count, step.max ?? 5); i += 1) texts.push((await locator.nth(step.last ? count - 1 - i : i).innerText()).trim())
    await log(`\n> gelesen (${step.testId ?? step.selector ?? 'Seite'}, ${count}×):\n${texts.join('\n---\n').slice(0, step.chars ?? 4000)}`)
  },
  /** Lists the test ids currently on the page, to find one's way around. */
  async ids(step) {
    const ids = await page.$$eval('[data-testid]', (nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-testid')))])
    await log(`\n> testids${step.filter ? ` (${step.filter})` : ''}: ${ids.filter((id) => !step.filter || id.includes(step.filter)).join(' ')}`)
  },
  /** Attaches one document in the chat, answers „Für wen ist dieser Beleg?“ and logs what the app made of it. */
  async attach(step) {
    const before = await page.locator(ANSWERS).count()
    if ((await tid('advisor-receipt-file-input').count()) === 0) await tid('advisor-receipt-attach-btn').click()
    await tid('advisor-receipt-file-input').setInputFiles(step.file, { timeout: 15_000 })
    await log(`\n### Ich (Upload)\n${step.file.split('/').slice(-2).join('/')} → ${step.who === 'b' ? 'für Person B' : 'für mich'}`)
    const reading = page.getByText('Dokument wird auf dem Gerät erkannt')
    const whose = page.getByText('Für wen ist dieser Beleg?')
    // Person B is offered by name once the owl knows it („Für Büsra“), as „Für Person B“ before.
    const choice = step.who === 'b' ? page.getByRole('button', { name: /^Für (?!mich$)\S+( B)?$/ }) : page.getByRole('button', { name: 'Für mich', exact: true })
    let asked = false
    for (let i = 0; i < 360; i += 1) {
      if (!asked && (await whose.count()) > 0 && (await choice.count()) > 0) {
        await proof('fuer-wen')
        await choice.first().click()
        asked = true
      }
      const busy = (await reading.count()) > 0 || (await tid('advisor-chat-stop').count()) > 0 || (await tid('advisor-streaming-message').count()) > 0
      if (!busy && i > 10 && (asked || i > 40)) break
      await sleep(500)
    }
    await sleep(2500)
    const after = await page.locator(ANSWERS).count()
    const answer = after > before ? (await page.locator(ANSWERS).last().innerText()).trim() : '(keine neue Nachricht im Chat)'
    await log(`\n> „Für wen?“ gefragt: ${asked ? 'ja' : 'nein'}\n\n### Eule (nach Upload)\n${answer.slice(0, 3000)}`)
    const notices = await tid('advisor-receipt-notice').allInnerTexts()
    if (notices.length) await log(`\n> Hinweis am Upload: ${notices.join(' | ').slice(0, 500)}`)
    if ((await tid('eule-workbench-panel').count()) === 0 && (await tid('eule-hints-pill').count()) > 0) await tid('eule-hints-pill').click().catch(() => {})
    await sleep(800)
    const bench = await tid('eule-workbench-panel').allInnerTexts()
    if (bench.length) await log(`\n> Werkbank: ${bench.join(' ').replace(/\s+/g, ' ').slice(0, 900)}`)
  },
  /** Takes over every draft the owl has prepared: the batch button if it is there, else each card's own button. */
  async applyDrafts() {
    const batch = tid('eule-batch-apply-btn')
    if ((await batch.count()) > 0 && (await batch.first().isVisible())) {
      await batch.first().click()
      await sleep(6000)
    }
    const single = page.locator('[data-testid$="-apply-btn"]:not([data-testid="eule-batch-apply-btn"])')
    let taken = 0
    for (let i = 0; i < 15 && (await single.count()) > 0; i += 1) {
      await single.first().scrollIntoViewIfNeeded()
      await single.first().click()
      taken += 1
      await sleep(3000)
    }
    const errors = await tid('advisor-chat-error').allInnerTexts()
    await log(`\n> Entwürfe übernommen: Sammelknopf ${(await batch.count()) > 0 ? 'ja' : 'nein'}, einzeln ${taken}${errors.length ? `, Fehlermeldung: ${errors.join(' | ').slice(0, 300)}` : ''}`)
  },
  /** Nothing to do: the evidence is taken after the step. */
  async proof() {},
  async shot(step) {
    await page.screenshot({ path: `${OUT}/shots/${step.name}.png`, fullPage: step.fullPage ?? false })
    await log(`\n> Bild: shots/${step.name}.png`)
  },
}


// Extra verbs for the Strom masks: read the visible text of the main area, list labelled fields.
VERBS.text = async (step) => {
  const t = await page.locator(step.selector ?? 'body').first().innerText()
  await log(`\n> Seite:\n${t.slice(0, step.chars ?? 3000)}`)
}
VERBS.goto = async (step) => { await page.goto(`${WEB}${step.path}`, { waitUntil: 'networkidle' }) }
VERBS.type = async (step) => { await target(step).pressSequentially(step.value, { delay: 15 }) }
VERBS.blur = async () => { await page.keyboard.press('Tab') }
VERBS.select = async (step) => { await target(step).selectOption(step.value) }

let busy = false
createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (busy) { res.writeHead(409); res.end('busy'); return }
  busy = true
  echo = []
  const lines = []
  const orig = log
  const steps = JSON.parse(raw)
  try {
    for (const step of steps) {
      const verb = VERBS[step.do]
      if (!verb) { lines.push(`unknown ${step.do}`); break }
      try {
        await verb(step)
        if (['login', 'click', 'upload', 'say', 'awaitAnswer', 'proof', 'applyDrafts', 'attach'].includes(step.do) && step.proof !== false) await proof(step.label ?? step.do)
        lines.push(`ok ${step.do}`)
      } catch (error) {
        await log(`\n> FEHLER bei ${JSON.stringify(step).slice(0, 200)}: ${String(error).slice(0, 400)}`)
        await page.screenshot({ path: `${OUT}/shots/error-${Date.now()}.png` }).catch(() => {})
        lines.push(`ERROR ${String(error).slice(0, 300)}`)
        break
      }
    }
  } finally { busy = false }
  res.writeHead(200); res.end(echo.join('\n') + '\n--\n' + lines.join('\n'))
}).listen(Number(process.env.DAEMON_PORT), '127.0.0.1', () => console.log('daemon on', process.env.DAEMON_PORT))
