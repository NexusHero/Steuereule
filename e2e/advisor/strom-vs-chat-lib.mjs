// Helpers of strom-vs-chat.mjs (manual, costs money): talk to the owl over the API the way the chat
// screen does, read everything a return stores back, flatten it so equal facts compare equal, read the
// editable printout's form fields, and diff two households against each other and the fixture.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PDFDocument } = require('../../apps/api/node_modules/pdf-lib')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function parseSse(text) {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (!event || !data) return null
      try {
        return { event, data: JSON.parse(data) }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export const describeDraft = (a) =>
  `${a.screen}${a.person === 'B' ? '(B)' : ''}${a.instance ? `[${String(a.instance).slice(0, 8)}]` : ''}.${a.field}=${a.newValue}${a.companionFields ? ` +${JSON.stringify(a.companionFields)}` : ''}`

/** Every draft of the year's chat, as the session lists them. */
export async function sessionDrafts(api, year) {
  const res = await api.get(`/v1/steuerjahre/${year}/advisor/session`)
  if (!res.ok()) return []
  const session = await res.json()
  return session.messages.flatMap((m) => [
    ...(m.meta?.action ? [m.meta.action] : []),
    ...(m.meta?.actions ?? []),
    ...(m.meta?.twoPaths ? [m.meta.twoPaths.safePath] : []),
  ])
}

/**
 * Takes over every pending draft the way „✓ Jetzt übernehmen“ does: one POST apply per draft. Of drafts
 * that are alternatives to each other (one `alternativeGroup`), only the first is taken, like the card.
 */
export async function applyPendingDrafts(api, year) {
  const seen = new Set()
  const groups = new Set()
  const applied = []
  for (const draft of await sessionDrafts(api, year)) {
    if (draft.status !== 'pending' || seen.has(draft.actionId)) continue
    seen.add(draft.actionId)
    if (draft.alternativeGroup) {
      if (groups.has(draft.alternativeGroup)) continue
      groups.add(draft.alternativeGroup)
    }
    const res = await api.post(`/v1/steuerjahre/${year}/advisor/actions/${draft.actionId}/apply`, { data: {} })
    const body = await res.json().catch(() => ({}))
    applied.push({ draft: describeDraft(draft), deltaEur: draft.deltaEur ?? null, ok: res.ok(), error: res.ok() ? null : `${res.status()} ${body.code ?? ''}: ${body.message ?? ''}`.trim() })
  }
  return applied
}

/** One chat turn over the stream route; returns the answer, the tools used and what could not be staged. */
export async function chatTurn(api, year, message) {
  const started = Date.now()
  const res = await api.post(`/v1/steuerjahre/${year}/advisor/stream`, { data: { message }, headers: { accept: 'text/event-stream' }, timeout: 180_000 })
  const events = parseSse(await res.text())
  const done = events.find((e) => e.event === 'done')?.data
  const error = events.find((e) => e.event === 'error')?.data
  const meta = done?.assistantMessage?.meta ?? {}
  return {
    httpStatus: res.status(),
    ms: Date.now() - started,
    // Without the model (quota, outage) the owl answers in its basis mode; such a turn says nothing about the chat.
    mode: done?.mode ?? null,
    modelFailure: meta.modelFailure ?? null,
    error: error ? `${error.code}: ${error.message}` : res.ok() ? null : `HTTP ${res.status()}`,
    tools: events.filter((e) => e.event === 'tool').map((e) => e.data.name),
    proposals: [...(meta.action ? [meta.action] : []), ...(meta.actions ?? []), ...(meta.twoPaths ? [meta.twoPaths.safePath] : [])].map(describeDraft),
    notStaged: meta.notStaged ?? [],
    questions: (meta.questionRound?.questions ?? []).map((q) => q.question ?? q.label ?? JSON.stringify(q)),
    reply: (done?.assistantMessage?.content ?? '').replace(/\s+/g, ' ').trim(),
  }
}

/**
 * Uploads an invented document into the chat the way the chat's attach button does (POST /belege/parse).
 * The app classifies the text on the device and sends the kind; the caller passes `{ kind: 'lstb' }` for
 * a German LStB like it does (with `auto` the server keeps an LStB on the generic receipt reader).
 */
export async function chatUpload(api, year, fileName, rawText, extra = {}) {
  const data = { taxYear: year, fileName, mimeType: 'application/pdf', textSource: 'pdf_text', kind: 'auto', rawText, stageDraft: true, ...extra }
  let res = await api.post('/v1/belege/parse', { data })
  let body = await res.json().catch(() => ({}))
  // ADR-0092: with more than one adult the app asks „Für wen ist dieser Beleg?“ and preselects the person
  // the printed name points to. The user taps that answer; the script does the same.
  const preselected = body.assignment?.holder === null ? body.assignment?.question?.preselected : null
  if (preselected) {
    res = await api.post('/v1/belege/parse', { data: { ...data, holder: preselected } })
    body = await res.json().catch(() => ({}))
  }
  return {
    fileName,
    ok: res.ok(),
    httpStatus: res.status(),
    staged: body.stagedAction ? describeDraft(body.stagedAction) : null,
    stagedMany: (body.stagedActions ?? []).map(describeDraft),
    person: body.lstb?.person ?? body.lstbScan?.person ?? body.chLohnausweis?.person ?? body.chLetter?.person ?? null,
    summary: body.parsed?.summary ?? body.message ?? null,
  }
}

const get = async (api, path) => {
  const res = await api.get(path)
  if (!res.ok()) return { httpStatus: res.status() }
  return res.json()
}

const ENTRIES = ['minimal-gate', 'segment-2', 'lebenslagen', 'einkuenfte', 'sonderausgaben', 'segment-ch', 'alleinerziehend', 'haushalt', 'gesundheit', 'vorauszahlungen', 'berufsprofil']

async function interviewAnswers(api, year, person) {
  const all = {}
  for (const entry of ENTRIES) {
    const body = await get(api, `/v1/steuerjahre/${year}/interview?eintrag=${entry}${person === 'B' ? '&person=B' : ''}`)
    Object.assign(all, body.answers ?? {})
  }
  return all
}

/** Everything a return stores, read back over the API (both persons where a Person B exists). */
export async function readReturn(api, year) {
  const Y = `/v1/steuerjahre/${year}`
  const coupling = await get(api, `${Y}/kopplung`)
  const persons = coupling.filingType === 'zusammen' || coupling.personB ? ['A', 'B'] : ['A']
  const state = {
    profile: await get(api, '/v1/profile'),
    stammdaten: await get(api, '/v1/stammdaten'),
    kopplung: coupling,
    kinder: await get(api, `${Y}/kinder`),
    kapital: await get(api, `${Y}/kapital`),
    vermietung: await get(api, `${Y}/vermietung`),
  }
  for (const p of persons) {
    const q = p === 'B' ? '?person=B' : ''
    state[`interview${p}`] = await interviewAnswers(api, year, p)
    state[`lstb${p}`] = await get(api, `${Y}/lstb${q}`)
    state[`lstbKirchensteuer${p}`] = await get(api, `${Y}/lstb-kirchensteuer${q}`)
    state[`lstbZuschuesse${p}`] = await get(api, `${Y}/lstb-zuschuesse${q}`)
    state[`arbeitsweg${p}`] = await get(api, `${Y}/arbeitsweg${q}`)
    state[`rente${p}`] = await get(api, `${Y}/rente${q}`)
    state[`chLohnausweis${p}`] = await get(api, `${Y}/ch-lohnausweis${q}`)
  }
  return state
}

export async function readEstimate(api, year) {
  return get(api, `/v1/steuerjahre/${year}/steuerschaetzung`)
}

// Keys that name a record, a time or a provenance, not a fact of the return.
const NOISE = /^(id|digit|personBUserId|invitationCodeValidUntil|userId|steuerjahr|taxYear|createdAt|updatedAt|appliedAt|actionId|receiptId|sourceId|objektId|invitationCode|etag|version|source|sources|provenance|origin|lastChangedBy|changedAt|recordedAt|confirmedAt|hint|hints|label|labels|text|explanation|reason|reasons|calculation|links?|next.*|status.*Text)$/i

const EMPTY_KINDS = new Set(['offen', 'leer', 'unbekannt', 'none'])
// Derived summaries the screens show (fold status, open items, what the Hauptvordruck misses): not facts.
const DERIVED = /^(status|requiredFields|missing|fehlend)$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
const itemKey = (item) => {
  if (!item || typeof item !== 'object') return null
  const named = item.field ?? item.fieldId ?? (typeof item.id === 'string' && !UUID.test(item.id) ? item.id : null)
  return named ?? (typeof item.kind === 'string' && !('value' in item) ? item.kind : null)
}

/** Flattens a value into `path → scalar`; `{kind:'erfasst', value}` becomes the value. */
export function flatten(value, prefix = '', out = {}) {
  if (value === null || value === undefined) return out
  if (Array.isArray(value)) {
    // Items that name themselves (Lohnausweis digits, provision kinds) are keyed by that name, not by position.
    value.forEach((item, i) => flatten(item, `${prefix}[${itemKey(item) ?? i}]`, out))
    return out
  }
  if (typeof value === 'object') {
    if ('kind' in value && ('value' in value || EMPTY_KINDS.has(value.kind)) && Object.keys(value).length <= 5) {
      if (value.value !== null && value.value !== undefined) out[prefix] = normalizeScalar(value.value)
      else if (value.kind && !EMPTY_KINDS.has(value.kind)) out[prefix] = value.kind
      return out
    }
    for (const [key, item] of Object.entries(value)) {
      if (NOISE.test(key) || (DERIVED.test(key) && typeof item === 'object')) continue
      flatten(item, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }
  if (value === '' || value === false) return out
  out[prefix] = normalizeScalar(value)
  return out
}

/** "1.234,50", "1234.5" and 1234.5 compare equal; ISO and German dates compare equal. */
export function normalizeScalar(v) {
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000)
  if (typeof v === 'boolean') return String(v)
  const s = String(v).trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/.exec(s)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) && s.includes(',')) return String(Number(s.replace(/\./g, '').replace(',', '.')))
  if (/^0\d/.test(s)) return s
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 10000) / 10000)
  return s
}

/** Sorts list-like records (children, objects) by a stable name so the order of entry does not matter. */
export function canonicalize(state) {
  const copy = structuredClone(state)
  if (Array.isArray(copy.kinder?.kinder)) copy.kinder.kinder.sort((a, b) => String(a.firstName).localeCompare(String(b.firstName)))
  const where = (o) => `${o.strasse?.value ?? o.strasse ?? ''} ${o.hausnummer?.value ?? o.hausnummer ?? ''} ${o.plz?.value ?? o.plz ?? ''}`
  for (const key of ['properties', 'objekte', 'objects']) {
    if (Array.isArray(copy.vermietung?.[key])) copy.vermietung[key].sort((a, b) => where(a).localeCompare(where(b)))
  }
  return copy
}

/** Reads every filled AcroForm field of a PDF: `{ name: value }` ('X' for a ticked box). */
export async function pdfFields(bytes) {
  const doc = await PDFDocument.load(bytes)
  const fields = {}
  for (const field of doc.getForm().getFields()) {
    let value = ''
    if (typeof field.getText === 'function') value = field.getText() ?? ''
    else if (typeof field.isChecked === 'function') value = field.isChecked() ? 'X' : ''
    else if (typeof field.getSelected === 'function') value = [field.getSelected()].flat().join('|')
    if (value !== '') fields[field.getName()] = value
  }
  return { pages: doc.getPageCount(), fields }
}

/** Downloads the editable printout; unlocking is the caller's job (unlockTaxYearInDb). */
export async function downloadPrintout(api, year) {
  const check = await get(api, `/v1/steuerjahre/${year}/ausdruck/pruefung`)
  const res = await api.get(`/v1/steuerjahre/${year}/ausdruck?bearbeitbar=true`, { timeout: 120_000 })
  if (!res.ok()) return { check, error: `HTTP ${res.status()}: ${(await res.text()).slice(0, 400)}` }
  return { check, bytes: await res.body() }
}

/**
 * Compares two flattened maps and the fixture's expectations. Every path that differs gets a first,
 * mechanical class; the report refines it by hand where the cause needs reading.
 */
export function diff(strom, chat, expected = {}) {
  const rows = []
  const paths = new Set([...Object.keys(strom), ...Object.keys(chat), ...Object.keys(expected)])
  for (const path of [...paths].sort()) {
    const a = strom[path]
    const b = chat[path]
    const f = expected[path] === undefined ? undefined : normalizeScalar(expected[path])
    if (a === b && (f === undefined || a === f)) continue
    let cls
    if (f === undefined && /^interview[AB]\./.test(path) && [a, b].includes('Nein') && [a, b].includes(undefined)) cls = 'harmlos-nein'
    else if (f !== undefined) {
      if (a === f && b === undefined) cls = 'chat-verpasst'
      else if (a === f) cls = 'chat-falsch'
      else if (b === f && a === undefined) cls = 'strom-ohne-platz'
      else if (b === f) cls = 'strom-falsch'
      else cls = 'beide-abweichend'
    } else if (a !== undefined && b === undefined) cls = 'nur-strom'
    else if (a === undefined && b !== undefined) cls = 'nur-chat'
    else cls = 'wert-verschieden'
    rows.push({ path, fixture: f ?? null, strom: a ?? null, chat: b ?? null, class: cls })
  }
  return rows
}

/** Token counts of every owl answer of an account, as stored with the message (no content). */
export function tokenUsage(sql, email, year) {
  const raw = sql(`SELECT coalesce(string_agg(m."verbrauch", E'\\n' ORDER BY m."createdAt"), '') FROM "BeraterNachricht" m JOIN "User" u ON u.id = m."userId" WHERE u.email = '${email}' AND m."steuerjahr" = ${year} AND m."rolle" = 'assistant'`)
  const turns = String(raw).split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  }).filter(Boolean)
  const sum = (pick) => turns.reduce((total, t) => total + (Number(pick(t)) || 0), 0)
  return {
    answers: turns.length,
    inputTokens: sum((t) => t.inputTokens ?? t.promptTokens ?? t.usage?.inputTokens),
    outputTokens: sum((t) => t.outputTokens ?? t.completionTokens ?? t.usage?.outputTokens),
    reasoningTokens: sum((t) => t.reasoningTokens ?? t.thoughtsTokens ?? t.usage?.reasoningTokens),
    cachedTokens: sum((t) => t.cachedInputTokens ?? t.cachedTokens ?? t.usage?.cachedInputTokens),
    raw: turns,
  }
}
