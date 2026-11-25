import { DomainError, type DomainErrorKind } from '../common/domain-error.js'
import { MCP_CHECKOUT_LINK_LIMIT, type ToolBudget } from './mcp-rate-limit.js'

/** The one shape of a tool answer and of a refusal: `isError`, a code and a next step (MCP-7, MCP-19). */

type TextContent = { type: 'text'; text: string }
export interface ToolResult {
  [key: string]: unknown
  content: TextContent[]
  isError?: boolean
}

/** A tool answer as the JSON text an MCP client reads. */
export const json = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] })

/** What the assistant does next after a refusal with this code; a code without its own falls back to its kind. */
const NEXT_STEPS: Readonly<Record<string, string>> = {
  RATE_LIMITED: 'Warte die genannte Zeit ab und fasse Einträge mit maske_eintragen_stapel zusammen.',
  MISSING_SCOPE: 'Starte die Anmeldung bei SteuerEule neu und fordere dabei die genannte Berechtigung an; der Nutzer gibt sie auf der Freigabeseite frei.',
  INVALID_ARGUMENTS: 'Prüfe die Argumente gegen das Schema des Werkzeugs (Felder und Formen nennt maske_felder) und rufe es erneut auf.',
  UNKNOWN_TOOL: 'Nutze nur die Werkzeuge, die tools/list nennt.',
  INTERNAL_ERROR: 'Versuch es in einer Minute noch einmal. Bleibt der Fehler, sage dem Nutzer, dass SteuerEule gerade nicht antwortet.',
  CONCURRENT_WRITE_CONFLICT: 'Lies den Stand neu (maske_lesen) und versuch es dann noch einmal.',
  NO_RECORD: 'Lies die gültigen Datensätze mit kinder_auflisten, vermietungen_auflisten, belege_auflisten oder aufgaben_auflisten.',
  RECEIPT_NOT_FOUND: 'Lies die gültigen Belege mit belege_auflisten.',
  NOT_OWN_ENTRY: 'Hinterlasse dem Nutzer mit aufgabe_fuer_nutzer eine Aufgabe; er entscheidet in der App.',
  TOO_MANY: 'Mehr legt nur der Nutzer in der App an; hinterlasse ihm bei Bedarf eine Aufgabe.',
  TOO_MANY_DRAFTS: 'Bitte den Nutzer, offene Entwürfe unter „Prüfen & bestätigen“ zu übernehmen oder zu verwerfen.',
  TOO_MANY_TASKS: 'Warte, bis der Nutzer offene Aufgaben erledigt; lies den Stand mit aufgaben_auflisten.',
  VORDRUCKE_MISSING: 'Für dieses Jahr druckt die App noch nicht; nimm ein Jahr, das steuerjahre_auflisten nennt.',
  PRINTOUT_BUDGET: 'Arbeite zuerst die Lücken ab und prüfe danach noch einmal; steuerbericht und pruefen nennen dieselben Lücken.',
  USER_ONLY: 'Das trägt nur der Nutzer in der App ein; hinterlasse ihm eine Aufgabe mit aufgabe_fuer_nutzer.',
  PAYMENT_NOT_CONFIGURED: 'Sage dem Nutzer, dass die Bezahlung gerade nicht verfügbar ist.',
  UPLOAD_BUSY: 'Warte ein paar Sekunden und lade den Beleg dann noch einmal hoch. Lade Belege nacheinander hoch, nicht mehrere gleichzeitig.',
}

const NEXT_BY_KIND: Readonly<Record<DomainErrorKind, string>> = {
  'invalid-input': 'Korrigiere die Angabe und rufe das Werkzeug erneut auf.',
  'not-found': 'Lies zuerst, was es gibt (steuerjahre_auflisten, kinder_auflisten, belege_auflisten …), und nimm einen dieser Werte.',
  conflict: 'Lies den Stand neu; der Nutzer oder ein anderer Aufruf hat ihn geändert.',
  forbidden: 'Das darf nur der Nutzer in der App; hinterlasse ihm eine Aufgabe mit aufgabe_fuer_nutzer.',
  unauthenticated: 'Starte die Anmeldung bei SteuerEule neu.',
  unavailable: 'Versuch es später noch einmal und sage es dem Nutzer.',
  'rate-limited': NEXT_STEPS.RATE_LIMITED!,
}

const DEFAULT_NEXT_STEP = 'Lies die Begründung, korrigiere die Angaben oder frage den Nutzer.'

/** German reasons for domain errors whose own message was written in English for the REST clients (MCP-7). */
const GERMAN_REASONS: Readonly<Record<string, string>> = {
  VORDRUCKE_MISSING: 'Für dieses Steuerjahr gibt es in der App noch keine amtlichen Vordrucke.',
  GEBURTSDATUM_INVALID: 'Das Geburtsdatum passt nicht zu diesem Steuerjahr (es liegt nach dem Jahresende oder ist kein gültiges Datum).',
  KIND_NOT_FOUND: 'Dieses Kind gibt es für das Jahr nicht.',
  BELEG_NOT_FOUND: 'Diesen Beleg gibt es in diesem Konto nicht.',
  TASK_NOT_FOUND: 'Diese Aufgabe gibt es für das Jahr nicht (oder sie ist nicht mehr offen).',
  PAYMENT_NOT_CONFIGURED: 'Die Bezahlung ist in dieser Umgebung nicht eingerichtet.',
}

const CODE_PATTERN = /^([A-Z][A-Z0-9_]{1,63}): ?([\s\S]*)$/

/**
 * A refusal the assistant can act on, flagged as an error: `error` keeps the `CODE: reason` text tools gave
 * before, `code` is the code alone and `naechsterSchritt` says what to do instead. `details` are further
 * fields of the refusal (what is missing, which values conflict); they never replace the three above.
 */
export function refused(error: string, nextStep?: string, details: Readonly<Record<string, unknown>> = {}): ToolResult {
  const match = CODE_PATTERN.exec(error.trim())
  const code = match?.[1] ?? 'REFUSED'
  const text = match ? error.trim() : `${code}: ${error.trim()}`
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ ...details, ok: false, code, error: text, naechsterSchritt: nextStep ?? NEXT_STEPS[code] ?? DEFAULT_NEXT_STEP }, null, 2) }],
  }
}

/** A thrown error as `CODE: reason`: a domain error keeps its code; anything else says nothing about the inside. */
export function reasonOfError(error: unknown, log: (message: string) => void = () => undefined): string {
  if (error instanceof DomainError) return `${error.code}: ${GERMAN_REASONS[error.code] ?? error.message}`
  // Never the message itself: it may be a database error with table, column or query (MCP-7).
  log(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  return 'INTERNAL_ERROR: Das hat in SteuerEule nicht geklappt; an deinen Angaben lag es nicht.'
}

/** A thrown error as a refusal, with the next step of its code or of its kind. */
export function refusalOfError(error: unknown, log: (message: string) => void = () => undefined): ToolResult {
  const reason = reasonOfError(error, log)
  return refused(reason, error instanceof DomainError ? (NEXT_STEPS[error.code] ?? NEXT_BY_KIND[error.kind]) : undefined)
}

/** The SDK's own error text (arguments failing the schema, an unknown tool) as a refusal of the same shape. */
export function refusalOfProtocolError(message: string): ToolResult {
  if (/Tool \S+ not found|Tool \S+ disabled/.test(message)) return refused('UNKNOWN_TOOL: Dieses Werkzeug gibt es nicht.')
  const reason = message.replace(/^MCP error -?\d+: /, '').replace(/^Input validation error: /, '').slice(0, 800)
  return refused(`INVALID_ARGUMENTS: ${reason}`)
}

/** The JSON object a tool answered with; null for any other text. */
function jsonObjectOf(text: string): Record<string, unknown> | null {
  if (!text.trimStart().startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * A result a tool built as `{ ok: false, … }` without flagging it: flagged, with a code and a next step
 * (MCP-19). What else the tool said about the refusal (`fehlt`, `konflikte` …) stays in the answer.
 */
export function normalisedResult(result: unknown): ToolResult {
  const candidate = result as ToolResult | undefined
  const text = candidate?.content?.[0]?.type === 'text' ? candidate.content[0].text : undefined
  if (candidate === undefined || text === undefined) return candidate ?? refused('INTERNAL_ERROR: Das Werkzeug gab nichts zurück.')
  const body = jsonObjectOf(text)
  if (body === null) return candidate.isError === true ? refused(text) : candidate
  if (body.ok !== false && candidate.isError !== true) return candidate
  if (typeof body.code === 'string' && typeof body.naechsterSchritt === 'string') return { ...candidate, isError: true }
  const reason = [body.error, body.grund, body.reason, body.hinweis].find((value): value is string => typeof value === 'string') ?? 'Das ging nicht.'
  const code = typeof body.code === 'string' ? body.code : CODE_PATTERN.exec(reason)?.[1] ?? 'NOT_POSSIBLE'
  return refused(CODE_PATTERN.test(reason) ? reason : `${code}: ${reason}`, undefined, body)
}

const minutes = (seconds: number): number => Math.ceil(seconds / 60)

/** The German refusal of a call whose tool budget is used up, as `CODE: reason`. */
export const BUDGET_REFUSALS: Readonly<Record<ToolBudget, (retryAfterSeconds: number) => string>> = {
  printout: (seconds) => `PRINTOUT_BUDGET: Die Ausdruck-Prüfung lief in der letzten Minute schon oft. Versuch es in ${seconds} Sekunden wieder.`,
  // Every link is a new checkout session at the payment provider: a few an hour, not 120 a minute.
  checkoutLink: (seconds) =>
    `RATE_LIMITED: Für dieses Konto wurden in der letzten Stunde schon ${MCP_CHECKOUT_LINK_LIMIT.max} Zahllinks angefordert. Gib dem Nutzer den zuletzt erhaltenen Link, oder versuch es in ${minutes(seconds)} Minuten wieder.`,
  receiptUpload: (seconds) => `RATE_LIMITED: Über diesen Zugang wurden gerade viele Belege hochgeladen. Versuch es in ${minutes(seconds)} Minuten wieder.`,
}

/** The German refusal of a call over the limit. */
export const rateLimitRefusal = (retryAfterSeconds: number, perMinute: number): ToolResult =>
  refused(`RATE_LIMITED: Zu viele Werkzeugaufrufe (höchstens ${perMinute} je Minute). Versuch es in ${retryAfterSeconds} Sekunden wieder und fasse Einträge mit maske_eintragen_stapel zusammen.`)
