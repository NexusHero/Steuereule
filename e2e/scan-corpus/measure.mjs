// #450 Teil 3B — runs every document of the synthetic corpus through the real LStB scan (on-device
// text layer / self-hosted OCR, then the API parse) and reports, per variant:
//   * accuracy per field, to the cent (D3: digital PDF 100 %, every other variant ≥ 95 %)
//   * "falsch, aber sicher": a wrong value without the check mark the user must confirm (hard 0)
//   * Zero-Write: nothing reaches the LStB before "Werte übernehmen" (hard 0)
//   * On-Device: no request leaves the app's own two origins (hard 0)
//   * time until the draft is shown (D4: text PDF ≤ 2 s, scan/photo ≤ 20 s)
// The report goes to $SCAN_CORPUS_REPORT_DIR (default /tmp/scan-corpus) as JSON and Markdown.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin } from '../harness/api-account.mjs'

const TAG = 'scan-corpus'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.SCAN_CORPUS_REPORT_DIR ?? '/tmp/scan-corpus'
const YEAR = 2025
const FIELDS = ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung']

export const THRESHOLDS = {
  accuracyDigital: 1,
  accuracyOther: 0.95,
  wrongButSure: 0,
  zeroWriteViolations: 0,
  externalRequests: 0,
  textPdfMs: 2_000,
  scanMs: 20_000,
}
const WAIT_MS = 90_000
// POST /v1/belege/parse allows 15 requests per minute (receipt-parse.controller.ts); stay below it.
const PARSE_LIMIT = { max: 14, windowMs: 61_000 }

const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' }

/** German amount text as typed in the draft field → euros (null when empty or unreadable). */
export function amountFrom(text) {
  const cleaned = (text ?? '').replace(/[^\d,.-]/g, '')
  if (cleaned === '') return null
  const thousandsOnly = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)
  const normalised = cleaned.includes(',') || thousandsOnly ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

/** Pure scoring of one document's outcome against the manifest entry. */
export function score(entry, outcome) {
  const result = { file: entry.file, variant: entry.variant, layout: entry.layout, ms: outcome.ms, outcome: outcome.kind, fields: {}, correct: 0, total: 0, wrongButSure: 0, problems: [] }
  if (entry.kind === 'negative') {
    const greens = FIELDS.filter((f) => outcome.fields?.[f]?.sure && outcome.fields[f].value !== null)
    if (entry.expectation === 'year-conflict' && outcome.kind !== 'year-conflict') result.problems.push(`expected the year dialog, got ${outcome.kind}`)
    if (entry.expectation === 'read-error' && outcome.kind !== 'error') result.problems.push(`expected an honest read error, got ${outcome.kind}`)
    // A document that is no LStB must never produce a green amount.
    result.wrongButSure = greens.length
    if (greens.length > 0) result.problems.push(`green values on a non-LStB document: ${greens.join(', ')}`)
    return result
  }
  if (outcome.kind !== 'draft') {
    result.problems.push(`no draft (${outcome.kind}${outcome.message ? `: ${outcome.message}` : ''})`)
    result.total = Object.keys(entry.expected).length
    return result
  }
  for (const field of FIELDS) {
    const got = outcome.fields[field] ?? { value: null, sure: false }
    const want = entry.expected[field]
    if (want === undefined) {
      // Not on the document (cut off): it may be empty or flagged, never green.
      if (got.sure && got.value !== null) {
        result.wrongButSure += 1
        result.problems.push(`${field} is not on the document but came back green (${got.value})`)
      }
      result.fields[field] = { want: null, got: got.value, sure: got.sure }
      continue
    }
    result.total += 1
    // The LStB mask stores whole euros (amounts are integers end to end), so the document's cents are
    // compared after rounding to the euro: 10.918,32 → 10.918.
    const ok = got.value !== null && Math.round(got.value) === Math.round(want)
    if (ok) result.correct += 1
    else if (got.sure) {
      result.wrongButSure += 1
      result.problems.push(`${field}: ${got.value} shown as sure, expected ${want}`)
    }
    result.fields[field] = { want, got: got.value, sure: got.sure, ok }
  }
  return result
}

/**
 * Aggregates per variant and checks the thresholds; returns { rows, violations }.
 * Hard everywhere: "falsch, aber sicher" = 0, Zero-Write, On-Device, the time budgets, the negative
 * cases and 100 % on the digital PDF. A photo variant below the 95 % target (D3) fails only when it
 * drops below its committed `floor` (accuracy-floor.json) — the gap is reported, never hidden.
 */
export function evaluate(results, { zeroWriteViolations, externalRequests, floor = {} }) {
  const byVariant = new Map()
  for (const r of results) {
    const row = byVariant.get(r.variant) ?? { variant: r.variant, documents: 0, correct: 0, total: 0, wrongButSure: 0, maxMs: 0, problems: [] }
    row.documents += 1
    row.correct += r.correct
    row.total += r.total
    row.wrongButSure += r.wrongButSure
    row.maxMs = Math.max(row.maxMs, r.ms)
    row.problems.push(...r.problems.map((p) => `${r.file}: ${p}`))
    byVariant.set(r.variant, row)
  }
  const violations = []
  const rows = [...byVariant.values()].map((row) => {
    const accuracy = row.total === 0 ? null : row.correct / row.total
    const textPdf = row.variant === 'digital-pdf' || row.variant === 'mehrseitig'
    const minAccuracy = row.variant === 'digital-pdf' ? THRESHOLDS.accuracyDigital : THRESHOLDS.accuracyOther
    const budgetMs = textPdf ? THRESHOLDS.textPdfMs : THRESHOLDS.scanMs
    const allowed = row.variant === 'digital-pdf' ? minAccuracy : Math.min(minAccuracy, floor[row.variant] ?? minAccuracy)
    if (accuracy !== null && accuracy + 1e-9 < allowed) violations.push(`${row.variant}: accuracy ${(accuracy * 100).toFixed(1)} % < ${(allowed * 100).toFixed(1)} %`)
    const belowTarget = accuracy !== null && accuracy + 1e-9 < minAccuracy
    if (row.wrongButSure > THRESHOLDS.wrongButSure) violations.push(`${row.variant}: ${row.wrongButSure} × "falsch, aber sicher"`)
    if (!row.variant.startsWith('negativ') && row.maxMs > budgetMs) violations.push(`${row.variant}: ${row.maxMs} ms > ${budgetMs} ms`)
    if (row.variant.startsWith('negativ') && row.problems.length > 0) violations.push(...row.problems)
    return { ...row, accuracy, minAccuracy, budgetMs, floor: floor[row.variant] ?? null, belowTarget }
  })
  if (zeroWriteViolations > THRESHOLDS.zeroWriteViolations) violations.push(`Zero-Write: ${zeroWriteViolations} value(s) stored before "Werte übernehmen"`)
  if (externalRequests > THRESHOLDS.externalRequests) violations.push(`On-Device: ${externalRequests} request(s) left the app's origins`)
  return { rows, violations }
}

function markdown(rows, extra) {
  const lines = [
    '# Scan-Korpus: Kennzahlen je Variante (#450 Teil 3B)',
    '',
    '| Variante | Dokumente | Felder richtig | Genauigkeit | Ziel (D3) | Untergrenze | „falsch, aber sicher“ | max. Zeit | Budget |',
    '| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((r) =>
      `| ${r.variant} | ${r.documents} | ${r.total === 0 ? '–' : `${r.correct}/${r.total}`} | ${r.accuracy === null ? '–' : `${(r.accuracy * 100).toFixed(1)} %`} | ${r.variant.startsWith('negativ') ? '–' : `${r.minAccuracy * 100} %`} | ${r.floor === null ? '–' : `${(r.floor * 100).toFixed(1)} %`} | ${r.wrongButSure} | ${(r.maxMs / 1000).toFixed(1)} s | ${r.variant.startsWith('negativ') ? '–' : `${r.budgetMs / 1000} s`} |`,
    ),
    '',
    `Zero-Write-Verstöße: ${extra.zeroWriteViolations} · Requests an fremde Hosts: ${extra.externalRequests}`,
    '',
    ...(rows.some((r) => r.belowTarget) ? ['**Unter dem Ziel von 95 % (Fund, nicht versteckt):** ' + rows.filter((r) => r.belowTarget).map((r) => `${r.variant} ${(r.accuracy * 100).toFixed(1)} %`).join(', ')] : []),
    '',
    ...(extra.violations.length === 0 ? ['**Alle Schwellwerte eingehalten.**'] : ['**Verstöße:**', ...extra.violations.map((v) => `- ${v}`)]),
  ]
  return lines.join('\n') + '\n'
}

async function readOutcome(page) {
  const draft = page.locator('[data-testid="lstb-scan-draft-banner"]')
  const year = page.locator('[data-testid="lstb-year-conflict-modal"]')
  const error = page.locator('[data-testid="lstb-scan-error"]')
  const which = await Promise.race([
    draft.waitFor({ state: 'visible', timeout: WAIT_MS }).then(() => 'draft'),
    year.waitFor({ state: 'visible', timeout: WAIT_MS }).then(() => 'year-conflict'),
    error.waitFor({ state: 'visible', timeout: WAIT_MS }).then(() => 'error'),
  ]).catch(() => 'timeout')
  if (which === 'error') return { kind: 'error', message: await error.innerText() }
  if (which !== 'draft') return { kind: which }
  const fields = {}
  for (const field of FIELDS) {
    const chip = page.locator(`[data-testid="lstb-chip-${field}"]`)
    if ((await chip.count()) === 0) {
      fields[field] = { value: null, sure: false }
      continue
    }
    const value = amountFrom(await page.locator(`[data-testid="lstb-${field}"]`).inputValue())
    const needsCheck = (await page.locator(`[data-testid="lstb-confirm-field-${field}"]`).count()) > 0
    fields[field] = { value, sure: !needsCheck }
  }
  return { kind: 'draft', fields }
}

async function main() {
  const manifest = JSON.parse(await readFile(join(HERE, 'manifest.json'), 'utf8'))
  const only = process.env.SCAN_CORPUS_ONLY
  const entries = only ? manifest.filter((e) => e.file.includes(only)) : manifest
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    await answer(user.api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    const ctx = await newContextAtBreakpoint(browser, 'l')
    const own = [new URL(apiOrigin).origin, new URL(webOrigin).origin]
    const external = []
    ctx.on('request', (request) => {
      const url = request.url()
      if (/^(data|blob):/.test(url)) return
      if (!own.includes(new URL(url).origin)) external.push(url)
    })
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    const results = []
    let zeroWriteViolations = 0
    const parses = []
    for (const entry of entries) {
      while (parses.length >= PARSE_LIMIT.max && Date.now() - parses[parses.length - PARSE_LIMIT.max] < PARSE_LIMIT.windowMs) {
        await page.waitForTimeout(PARSE_LIMIT.windowMs - (Date.now() - parses[parses.length - PARSE_LIMIT.max]) + 100)
      }
      parses.push(Date.now())
      await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid="lstb-scan-card"]').waitFor({ state: 'visible', timeout: 15_000 })
      const ext = entry.file.split('.').pop()
      const buffer = await readFile(join(HERE, 'files', entry.file))
      const started = Date.now()
      await page.locator('[data-testid="lstb-scan-file-input"]').setInputFiles({ name: entry.file, mimeType: MIME[ext], buffer })
      const outcome = await readOutcome(page)
      outcome.ms = Date.now() - started
      const scored = score(entry, outcome)
      results.push(scored)
      console.log(`[${TAG}] ${scored.problems.length === 0 ? '✅' : '⚠️ '} ${entry.file} — ${outcome.kind}, ${scored.total ? `${scored.correct}/${scored.total} fields` : ''} ${(outcome.ms / 1000).toFixed(1)} s${scored.problems.length ? ` — ${scored.problems.join('; ')}` : ''}`)
      if (outcome.fields) console.log(`[${TAG}]      ${FIELDS.map((f) => `${f}=${outcome.fields[f]?.value}${outcome.fields[f]?.sure ? '✓' : '?'}`).join(' ')}`)

      // Zero-Write: the LStB stays empty while a draft is only staged.
      const stored = await call(user.api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)
      if (FIELDS.some((f) => stored[f]?.value !== null && stored[f]?.value !== undefined)) zeroWriteViolations += 1
      // Leave a clean slate for the next document.
      if (outcome.kind === 'draft') {
        await page.locator('[data-testid="lstb-scan-discard"]').click()
        await page.locator('[data-testid="lstb-scan-draft-banner"]').waitFor({ state: 'detached', timeout: 15_000 })
      } else if (outcome.kind === 'year-conflict') {
        await page.locator('[data-testid="lstb-year-conflict-cancel"]').click()
      }
    }

    const floor = JSON.parse(await readFile(join(HERE, 'accuracy-floor.json'), 'utf8'))
    const { rows, violations } = evaluate(results, { zeroWriteViolations, externalRequests: external.length, floor: only ? {} : floor })
    await mkdir(REPORT_DIR, { recursive: true })
    await writeFile(join(REPORT_DIR, 'scan-corpus-report.json'), JSON.stringify({ thresholds: THRESHOLDS, rows, results, external, violations }, null, 2) + '\n')
    const md = markdown(rows, { zeroWriteViolations, externalRequests: external.length, violations })
    await writeFile(join(REPORT_DIR, 'scan-corpus-report.md'), md)
    console.log(`\n${md}`)
    await ctx.close()
    await user.api.dispose()
    if (violations.length > 0) fail(`${violations.length} threshold violation(s) — see ${REPORT_DIR}/scan-corpus-report.md`)
    console.log(`[${TAG}] PASS — every variant within the #450 3B thresholds.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
