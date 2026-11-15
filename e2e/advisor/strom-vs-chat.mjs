// Manual exploration, not a CI gate: does the chat fill the same return as the Strom (ADR-0089)?
// For each invented household the same year is entered twice: once through the Strom and the masks
// in a real browser, once only through the owl chat against the REAL model (natural sentences, the
// invented documents uploaded into the chat, every draft taken over like „✓ Jetzt übernehmen“, a
// last „fehlt noch etwas?“). Then everything stored, the estimate and the editable printout's form
// fields are read back for both accounts and diffed against each other and the fixture.
// Costs money (about 70.000 input tokens per chat turn); reports instead of asserting.
//
//   API_ORIGIN=… WEB_ORIGIN=… DATABASE_URL=… CHAT_API_ORIGIN=… node advisor/strom-vs-chat.mjs
//
// API_ORIGIN serves the web app (no model key needed); CHAT_API_ORIGIN is an API of the same build on
// the same database started with a provider key (see customer-chat-scenario.mjs). ATTACH mode only.
// HOUSEHOLDS=lena,weber,… picks households (default: all), PATHS picks the paths (default strom,chat,hand):
// `hand` enters, after the chat, the master data the owl may not write, so that the printouts can be
// compared; `vorab` is a second chat account that gets those master data by hand before the conversation
// (does the chat fill Person B once B exists?); `ohne` is a chat account without the consent to personal
// data (PUT /v1/eulen-modus/personendaten-einwilligung), which `chat` and `vorab` give first. COMPARE_ONLY=1 rebuilds the diff from the stored results, MAX_TURNS caps the chat.
// Output in SCENARIO_OUT: <household>/{strom,chat,vorab}.json, the PDFs, <household>/diff.json (+ diff-vorab.json).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { makeSql } from '../harness/stack.mjs'
import { createAccount } from '../harness/api-account.mjs'
import { waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { registerAndOnboard, selectTaxYear2025, unlockTaxYearInDb, AUTH_BUCKET, TEST_PASSWORD } from '../scenarios/helpers/scenario-harness.mjs'
import { HOUSEHOLDS } from './strom-vs-chat-households.mjs'
import {
  sleep,
  chatTurn,
  chatUpload,
  applyPendingDrafts,
  readReturn,
  readEstimate,
  flatten,
  canonicalize,
  pdfFields,
  downloadPrintout,
  diff,
  tokenUsage,
} from './strom-vs-chat-lib.mjs'

const YEAR = 2025
const OUT = process.env.SCENARIO_OUT ?? '/tmp/strom-vs-chat'
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 16)
const PATHS = (process.env.PATHS ?? 'strom,chat,hand').split(',')

function env(name) {
  const value = process.env[name]
  if (!value) throw new Error(`strom-vs-chat needs ${name} (ATTACH mode only: this script never boots a stack)`)
  return value
}

const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14)

async function signedInApi(apiOrigin, webOrigin, email, tag) {
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', tag)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: TEST_PASSWORD } })
  if (!res.ok()) throw new Error(`sign-in for ${email} answered ${res.status()}`)
  return api
}

/** Reads back what the account stored, its estimate, and the editable printout (after unlocking the year). */
async function collect(api, sql, email, dir, path) {
  const state = canonicalize(await readReturn(api, YEAR))
  const estimate = await readEstimate(api, YEAR)
  unlockTaxYearInDb(sql, email, YEAR)
  const printout = await downloadPrintout(api, YEAR)
  let pdf = null
  if (printout.bytes) {
    await writeFile(`${dir}/${path}.pdf`, printout.bytes)
    pdf = await pdfFields(printout.bytes)
  }
  return { state, flat: flatten(state), estimate, printoutCheck: printout.check, printoutError: printout.error ?? null, pdf }
}

async function runStrom(household, browser, ctx) {
  const { webOrigin, apiOrigin, sql, dir } = ctx
  const email = `svc-${household.id}-strom-${stamp()}@beispiel.de`
  const context = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await context.newPage()
  const problems = []
  guardAgainst429(page, (message) => problems.push(message))
  const started = Date.now()
  let error = null
  try {
    await registerAndOnboard(page, { email, ...household.onboarding }, webOrigin, `svc-${household.id}`)
    await selectTaxYear2025(page)
    await household.strom(page, { webOrigin, apiOrigin, sql, email, year: YEAR, note: (m) => problems.push(m) })
  } catch (err) {
    error = String(err.stack ?? err).slice(0, 1500)
    await page.screenshot({ path: `${dir}/strom-error.png`, fullPage: true }).catch(() => {})
  }
  await context.close()
  const api = await signedInApi(apiOrigin, webOrigin, email, `svc-${household.id}`)
  const result = { email, ms: Date.now() - started, error, problems, ...(await collect(api, sql, email, dir, 'strom')) }
  await api.dispose()
  return result
}

/** Answers the owl's follow-up questions from the household's fact sheet: every fact whose words it asks for, once. */
function followUps(household, reply, said) {
  const text = reply.toLowerCase()
  return household.chat.facts.filter((fact) => !said.has(fact.say) && fact.when.some((word) => text.includes(word))).map((fact) => fact.say)
}

/**
 * The chat path. `vorab`: the master data the owl may not write (identity, address, bank, Person B) are
 * entered by hand first, as the owl tells the user to; then the same conversation follows.
 */
async function runChat(household, ctx, { vorab = false, consent = true, path = 'chat' } = {}) {
  const { webOrigin, chatOrigin, sql, dir } = ctx
  const { email, api } = await createAccount({ apiOrigin: chatOrigin, webOrigin, sql, tag: `svc-${household.id}-${path}` })
  // The user's one-time consent that the owl may write personal data (identity, address, bank, Person B,
  // children); without it the owl keeps away from those fields. `ohne` runs the same chat without it.
  let consentStatus = null
  if (consent) {
    const res = await api.fetch('/v1/eulen-modus/personendaten-einwilligung', { method: 'PUT', data: { granted: true } })
    consentStatus = res.status()
  }
  const enteredFirst = vorab ? await enterMasterData(api, household, {}) : null
  const started = Date.now()
  const log = []
  const uploads = []
  const said = new Set()
  const queue = [...household.chat.turns]
  let turns = 0
  let finalAsked = false
  while (turns < MAX_TURNS) {
    let message = queue.shift()
    if (message === undefined) {
      if (finalAsked) break
      finalAsked = true
      message = household.chat.finalQuestion ?? 'Fehlt jetzt noch etwas, damit meine Erklärung vollständig ist? Bitte sag mir genau, welche Angaben noch fehlen.'
    }
    if (typeof message === 'object' && message.upload) {
      for (const doc of message.upload) {
        uploads.push(await chatUpload(api, YEAR, doc.name, doc.text, doc.kind ? { kind: doc.kind } : {}))
        await sleep(5000)
      }
      const applied = await applyPendingDrafts(api, YEAR)
      log.push({ upload: message.upload.map((d) => d.name), applied })
      console.log(`[strom-vs-chat] ${household.id} chat: uploaded ${message.upload.length}, applied ${applied.map((a) => (a.ok ? '✓ ' : '✗ ') + a.draft).join(' | ') || '—'}`)
      continue
    }
    turns += 1
    said.add(message)
    const turn = await chatTurn(api, YEAR, message)
    const applied = await applyPendingDrafts(api, YEAR)
    log.push({ turn: turns, message, ...turn, applied })
    console.log(`[strom-vs-chat] ${household.id} chat turn ${turns} (${turn.ms} ms): ${applied.map((a) => (a.ok ? '✓ ' : '✗ ') + a.draft).join(' | ') || '—'}${turn.error ? ` ERROR ${turn.error}` : ''}${turn.modelFailure ? ` MODEL-FAILURE ${JSON.stringify(turn.modelFailure)}` : ''}`)
    // The owl's follow-up questions are answered from the fact sheet, before the next scripted sentence.
    const answers = followUps(household, turn.reply + ' ' + turn.questions.join(' '), said)
    if (answers.length > 0) {
      answers.forEach((a) => said.add(a))
      queue.unshift(answers.join(' '))
    } else if (finalAsked) break
    await sleep(Math.max(0, 7000 - turn.ms))
  }
  const usage = tokenUsage(sql, email, YEAR)
  const result = { email, consent, consentStatus, ms: Date.now() - started, turns, log, uploads, enteredFirst, usage: { ...usage, raw: undefined }, ...(await collect(api, sql, email, dir, path)) }
  await api.dispose()
  return result
}

const iso = (d) => (/^\d{2}\.\d{2}\.\d{4}$/.test(String(d)) ? String(d).split('.').toReversed().join('-') : d)

/**
 * The owl may not write identity, address, bank details or the coupling (AI_FORBIDDEN_SCREENS/FIELDS)
 * and sends the user to „Profil & Stammdaten“. To compare the printouts at all, this step does what the
 * owl asks for: it enters by hand, over the API like that mask, only the master data the chat account
 * still lacks, then reads the estimate and the printout again. The chat-only state stays the one compared.
 */
/** Enters by hand, over the API like the master-data mask, the fixture's master data that `have` lacks. */
async function enterMasterData(api, household, have) {
  const want = household.expected ?? {}
  const pick = (prefix) => Object.fromEntries(Object.entries(want).filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('.')).map(([k, v]) => [k.slice(prefix.length), v]))
  const missing = (prefix, fields) => Object.fromEntries(Object.entries(fields).filter(([k]) => have[`${prefix}${k}`] === undefined))
  const entered = {}
  const put = async (path, data) => {
    if (Object.keys(data).length === 0) return
    const res = await api.fetch(path, { method: 'PUT', data })
    entered[path] = { data, status: res.status(), error: res.ok() ? null : (await res.text()).slice(0, 300) }
  }
  await put('/v1/profile', missing('profile.', pick('profile.')))
  const master = missing('stammdaten.', pick('stammdaten.'))
  if (master.geburtsdatum) master.geburtsdatum = iso(master.geburtsdatum)
  if (master.familienstandSeit) master.familienstandSeit = iso(master.familienstandSeit)
  if (master.religion) master.religionConsent = true
  await put('/v1/stammdaten', master)
  if (want['kopplung.filingType'] === 'zusammen') {
    if (have['kopplung.filingType'] !== 'zusammen') await put(`/v1/steuerjahre/${YEAR}/kopplung`, { filingType: 'zusammen' })
    if (Object.keys(missing('kopplung.personB.', pick('kopplung.personB.'))).length > 0) {
      const full = { ...pick('kopplung.personB.'), religionConsent: true }
      if (full.geburtsdatum) full.geburtsdatum = iso(full.geburtsdatum)
      await put(`/v1/steuerjahre/${YEAR}/kopplung/person-b`, full)
    }
  }
  return entered
}

/**
 * The owl may not write identity, address, bank details or the coupling (AI_FORBIDDEN_SCREENS/FIELDS)
 * and sends the user to „Profil & Stammdaten“. To compare the printouts at all, this step does what the
 * owl asks for after the chat: it enters only the master data the chat account still lacks, then reads
 * the estimate and the printout again. The chat-only state stays the one compared.
 */
async function completeByHand(household, ctx, chat, path) {
  const { webOrigin, chatOrigin, sql, dir } = ctx
  const api = await signedInApi(chatOrigin, webOrigin, chat.email, `svc-${household.id}-hand`)
  const entered = await enterMasterData(api, household, flatten(chat.state))
  const after = await collect(api, sql, chat.email, dir, `${path}-plus-stammdaten`)
  await api.dispose()
  return { entered, estimate: after.estimate, printoutCheck: after.printoutCheck, printoutError: after.printoutError, pdf: after.pdf }
}

function compare(household, strom, chat) {
  const stored = diff(strom?.state ? flatten(strom.state) : {}, chat?.state ? flatten(chat.state) : {}, household.expected ?? {})
  // The chat's printout is the one after the master data were entered by hand (the owl may not write them).
  const chatPdf = chat?.byHand?.pdf ?? chat?.pdf
  const pdf = diff(strom?.pdf?.fields ?? {}, chatPdf?.fields ?? {}, household.expectedPdf ?? {})
  const pick = (e) => (e && !e.httpStatus ? flatten({ kind: e.kind, result: e.result, taxableIncome: e.taxableIncome, incomeTax: e.incomeTax, werbungskosten: e.werbungskosten, provision: e.provision, specialExpenses: e.specialExpenses, anrechnung: e.anrechnung, joint: e.jointAssessment }) : e)
  const estimate = diff(flatten(strom?.estimate ?? {}), flatten(chat?.estimate ?? {}), {})
  const count = (rows) => rows.reduce((acc, r) => ({ ...acc, [r.class]: (acc[r.class] ?? 0) + 1 }), {})
  return {
    household: household.id,
    title: household.title,
    expectedEstimate: household.expectedEstimate ?? null,
    estimate: { strom: pick(strom?.estimate), chat: pick(chat?.estimate), chatPlusStammdaten: pick(chat?.byHand?.estimate) },
    byHand: chat?.byHand?.entered ?? null,
    counts: { stored: count(stored), pdf: count(pdf), estimate: estimate.length },
    stored,
    pdf,
    estimateDiff: estimate,
    printout: { strom: strom?.printoutError ?? 'ok', chat: chat?.printoutError ?? 'ok', chatPlusStammdaten: chat?.byHand ? (chat.byHand.printoutError ?? 'ok') : null, stromMissing: strom?.printoutCheck?.missing ?? null, chatMissing: chat?.printoutCheck?.missing ?? null, chatPlusStammdatenMissing: chat?.byHand?.printoutCheck?.missing ?? null },
    errors: { strom: strom?.error ?? null, chat: chat?.error ?? null },
    usage: chat?.usage ?? null,
  }
}

const CLASS_LABEL = {
  'chat-verpasst': 'Chat hat Fakt verpasst',
  'chat-falsch': 'Chat: falscher Wert/Feld',
  'strom-ohne-platz': 'Strom ohne Platz / nicht erfasst',
  'strom-falsch': 'Strom weicht ab',
  'beide-abweichend': 'beide weichen vom Fixture ab',
  'nur-strom': 'nur Strom (ohne Fixture-Bezug)',
  'nur-chat': 'nur Chat (ohne Fixture-Bezug)',
  'wert-verschieden': 'Wert verschieden (ohne Fixture-Bezug)',
  'harmlos-nein': 'harmlos: explizites „Nein“ nur auf einer Seite',
}
const cell = (v) => (v === null || v === undefined ? '—' : String(v).replace(/\|/g, '\\|').slice(0, 80))

/** One household's tables (Feld | Fixture | Strom | Chat | Bewertung), the first, mechanical class as Bewertung. */
function markdownSection(result) {
  const table = (rows) => ['| Feld | Fixture | Strom | Chat | Bewertung |', '|---|---|---|---|---|', ...rows.map((r) => `| \`${r.path}\` | ${cell(r.fixture)} | ${cell(r.strom)} | ${cell(r.chat)} | ${CLASS_LABEL[r.class] ?? r.class} |`)].join('\n')
  return [
    `## ${result.title}`,
    `Schätzung Strom: ${cell(JSON.stringify(result.estimate.strom?.['result.from'] !== undefined ? [result.estimate.strom['result.from'], result.estimate.strom['result.to']] : result.estimate.strom))} · Chat: ${cell(JSON.stringify(result.estimate.chat?.['result.from'] !== undefined ? [result.estimate.chat['result.from'], result.estimate.chat['result.to']] : result.estimate.chat))}`,
    '### Gespeicherte Daten', result.stored.length ? table(result.stored) : 'keine Unterschiede',
    '### Ausdruck (AcroForm)', result.pdf.length ? table(result.pdf) : 'keine Unterschiede',
    '### Schätzung', result.estimateDiff.length ? table(result.estimateDiff) : 'keine Unterschiede',
  ].join('\n\n')
}

async function main() {
  const apiOrigin = env('API_ORIGIN')
  const webOrigin = env('WEB_ORIGIN')
  const chatOrigin = env('CHAT_API_ORIGIN')
  const sql = makeSql(env('DATABASE_URL'))
  const wanted = process.env.HOUSEHOLDS ? process.env.HOUSEHOLDS.split(',') : HOUSEHOLDS.map((h) => h.id)
  await mkdir(OUT, { recursive: true })
  const browser = PATHS.includes('strom') && !process.env.COMPARE_ONLY ? await launchBrowser() : null
  const summary = []
  const sections = []
  try {
    for (const household of HOUSEHOLDS.filter((h) => wanted.includes(h.id))) {
      const dir = `${OUT}/${household.id}`
      await mkdir(dir, { recursive: true })
      const ctx = { apiOrigin, webOrigin, chatOrigin, sql, dir }
      const results = {}
      for (const path of ['strom', 'chat', 'vorab', 'ohne']) {
        const file = `${dir}/${path}.json`
        if (!process.env.COMPARE_ONLY && PATHS.includes(path)) {
          console.log(`[strom-vs-chat] ${household.id}: ${path} …`)
          try {
            results[path] = path === 'strom' ? await runStrom(household, browser, ctx) : await runChat(household, ctx, { vorab: path === 'vorab', consent: path !== 'ohne', path })
          } catch (err) {
            results[path] = { error: String(err.stack ?? err).slice(0, 1500) }
          }
          await writeFile(file, JSON.stringify(results[path], null, 2))
        } else if (existsSync(file)) {
          results[path] = JSON.parse(await readFile(file, 'utf8'))
        }
      }
      for (const path of ['chat', 'vorab', 'ohne']) {
        if (!PATHS.includes('hand') || !results[path]?.email || process.env.COMPARE_ONLY) continue
        console.log(`[strom-vs-chat] ${household.id}: master data by hand for the ${path} account …`)
        results[path].byHand = await completeByHand(household, ctx, results[path], path).catch((err) => ({ error: String(err.stack ?? err).slice(0, 800) }))
        await writeFile(`${dir}/${path}.json`, JSON.stringify(results[path], null, 2))
      }
      for (const [path, label] of [['vorab', 'Stammdaten vorab von Hand'], ['ohne', 'Chat ohne Personendaten-Einwilligung']]) {
        if (!results[path]) continue
        const variant = compare({ ...household, title: `${household.title} — Variante: ${label}` }, results.strom, results[path])
        await writeFile(`${dir}/diff-${path}.json`, JSON.stringify(variant, null, 2))
        sections.push(markdownSection(variant))
      }
      const result = compare(household, results.strom, results.chat)
      await writeFile(`${dir}/diff.json`, JSON.stringify(result, null, 2))
      sections.push(markdownSection(result))
      summary.push({ household: household.id, counts: result.counts, estimate: result.estimate, errors: result.errors, usage: result.usage && { turns: results.chat?.turns, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } })
      console.log(`[strom-vs-chat] ${household.id}: ${JSON.stringify(result.counts)}`)
    }
  } finally {
    if (browser) await closeBrowser(browser)
  }
  await writeFile(`${OUT}/summary.json`, JSON.stringify(summary, null, 2))
  await writeFile(`${OUT}/tables.generated.md`, sections.join('\n\n'))
  console.log(`[strom-vs-chat] written to ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
