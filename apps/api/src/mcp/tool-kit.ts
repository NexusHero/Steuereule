import { Logger } from '@nestjs/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { SCREENS } from '@steuereule/core'
import { z } from 'zod'
import { assistantAuditSource, runWithAuditSource } from '../audit/audit-source.js'
import type { AuditService } from '../audit/audit.service.js'
import { DomainError, type DomainErrorKind } from '../common/domain-error.js'
import type { McpRateLimiter } from './mcp-rate-limit.js'
import type { AssistantSessionInfo } from './mcp-session.js'

/**
 * What every MCP tool shares (beta P4): the argument schemas, the one shape of a result and of a refusal, and
 * the gate every call passes. A tool file says what the tool does; the gate decides whether the call runs
 * (limit, scope), writes its audit row with the assistant, and turns whatever comes back — a refusal, an
 * `ok: false`, a thrown error — into `isError` with a code and a next step. Traces to: ADR-0052 §4, §10,
 * amendments 2, 6 and 9.
 */

// ---------------------------------------------------------------------------------------------------------
// Scopes

/** What an assistant may be granted (the OAuth scopes the MCP endpoint knows). */
export const MCP_SCOPE = {
  read: 'steuerdaten:read',
  write: 'steuerdaten:write',
  receipts: 'belege:write',
  payment: 'zahllink:write',
} as const

export type McpScope = (typeof MCP_SCOPE)[keyof typeof MCP_SCOPE]

/**
 * The payment scope before beta P4 (H2-21): a read scope for a tool that opens a checkout session. Grants made
 * with it still hold (their refresh tokens carry it), so it is accepted for `zahllink_anfordern` as before; new
 * grants are offered `zahllink:write` only. It can be dropped once no refresh token with it is left.
 */
export const LEGACY_PAYMENT_SCOPE = 'zahllink:read'

const ACCEPTED_FOR: Readonly<Record<McpScope, readonly string[]>> = {
  'steuerdaten:read': ['steuerdaten:read'],
  'steuerdaten:write': ['steuerdaten:write'],
  'belege:write': ['belege:write'],
  'zahllink:write': ['zahllink:write', LEGACY_PAYMENT_SCOPE],
}

export function hasScope(assistant: Pick<AssistantSessionInfo, 'scopes'>, scope: McpScope): boolean {
  return ACCEPTED_FOR[scope].some((granted) => assistant.scopes.includes(granted))
}

// ---------------------------------------------------------------------------------------------------------
// Policies: one row per tool

/** `read` changes nothing that stays; `write` adds or changes; `destructive` takes something away. */
export type ToolKind = 'read' | 'write' | 'destructive'

export interface ToolPolicy {
  readonly title: string
  readonly scope: McpScope
  readonly kind: ToolKind
  /** Renders the printout to find what does not fit: a budget of its own besides the call limit (H2-26). */
  readonly rendersPrintout?: true
  /** Reaches a third-party host (the law texts, the payment provider). */
  readonly openWorld?: true
}

const read = (title: string, extra: Partial<ToolPolicy> = {}): ToolPolicy => ({ title, scope: MCP_SCOPE.read, kind: 'read', ...extra })
const write = (title: string, extra: Partial<ToolPolicy> = {}): ToolPolicy => ({ title, scope: MCP_SCOPE.write, kind: 'write', ...extra })
const remove = (title: string, extra: Partial<ToolPolicy> = {}): ToolPolicy => ({ title, scope: MCP_SCOPE.write, kind: 'destructive', ...extra })

/** Every tool the server offers. A tool without a row here cannot be registered. */
export const TOOL_POLICIES: Readonly<Record<string, ToolPolicy>> = {
  steuerjahre_auflisten: read('Steuerjahre des Nutzers'),
  ausdruck_vorpruefung: read('Vorprüfung des Ausdrucks', { rendersPrintout: true }),
  eulen_hinweise: read('Eulen-Hinweise'),
  zahllink_anfordern: { title: 'Zahllink anfordern', scope: MCP_SCOPE.payment, kind: 'write', openWorld: true },
  steuerbericht: read('Stand der Erklärung', { rendersPrintout: true }),
  schaetzung_aufschluesseln: read('Rechenweg der Schätzung'),
  bescheid_abgleichen: read('Bescheid abgleichen'),
  pruefen: read('Erklärung prüfen', { rendersPrintout: true }),
  offene_fragen: read('Offene Interview-Fragen'),
  // Written on trial and always rolled back: nothing stays, but only an assistant that may write gets it.
  auswirkung_simulieren: { title: 'Wirkung eines Eintrags', scope: MCP_SCOPE.write, kind: 'read' },
  szenario_simulieren: { title: 'Wirkung mehrerer Einträge', scope: MCP_SCOPE.write, kind: 'read' },
  maske_lesen: read('Maske lesen'),
  haushalt_ueberblick: read('Haushalt im Überblick'),
  belege_auflisten: read('Belege auflisten'),
  maske_eintragen: write('Wert eintragen'),
  maske_eintragen_stapel: write('Mehrere Werte eintragen'),
  maske_felder: read('Felder einer Maske'),
  eintrag_zuruecknehmen: remove('Eigenen Eintrag zurücknehmen'),
  beleg_hochladen: { title: 'Beleg hochladen', scope: MCP_SCOPE.receipts, kind: 'write' },
  beleg_zuruecknehmen: { title: 'Eigenen Beleg zurücknehmen', scope: MCP_SCOPE.receipts, kind: 'destructive' },
  einkommensteuer_berechnen: read('Einkommensteuer berechnen'),
  veranlagungsarten_vergleichen: read('Veranlagungsarten mit frei gewählten Zahlen vergleichen'),
  kapitalertraege_guenstigerpruefung: read('Günstigerprüfung Kapitalerträge'),
  spekulationsfrist_pruefen: read('Spekulationsfrist prüfen'),
  renovierung_15_prozent_pruefen: read('15-%-Grenze prüfen'),
  schenkungsteuer_berechnen: read('Schenkung- und Erbschaftsteuer'),
  kleinunternehmer_pruefen: read('Kleinunternehmerregelung prüfen'),
  gewerbesteuer_schaetzen: read('Gewerbesteuer schätzen'),
  steuerwissen_lesen: read('Steuerwissen lesen'),
  gesetzestext_lesen: read('Gesetzestext lesen', { openWorld: true }),
  rechtsquelle_nachschlagen: read('Rechtsquelle nachschlagen'),
  kinder_auflisten: read('Kinder auflisten'),
  kind_anlegen: write('Kind anlegen'),
  kind_entfernen: remove('Eigenes Kind entfernen'),
  wechselkurs: read('Jahresdurchschnittskurs CHF'),
  feld_finden: read('Feld finden'),
  vordruck_zeilen: read('Zeilen der Vordrucke'),
  fristen: read('Abgabefrist'),
  vermietungen_auflisten: read('Vermietungen auflisten'),
  vermietung_anlegen: write('Vermietung anlegen'),
  vermietung_entfernen: remove('Eigene Vermietung entfernen'),
  aufgabe_fuer_nutzer: write('Aufgabe für den Nutzer'),
  aufgaben_auflisten: read('Eigene Aufgaben auflisten'),
  aufgabe_zuruecknehmen: remove('Eigene Aufgabe zurücknehmen'),
  buchung_entwerfen: write('Buchung entwerfen'),
  buchungsentwuerfe_auflisten: read('Eigene Buchungsentwürfe'),
  veranlagung_vergleichen: read('Veranlagungsarten aus den erfassten Zahlen vergleichen'),
  vorjahr_vergleichen: read('Mit dem Vorjahr vergleichen'),
}

/** The tool annotations a client shows (MCP-10): whether a call changes or removes something. */
export function annotationsOf(policy: ToolPolicy): ToolAnnotations {
  return {
    title: policy.title,
    readOnlyHint: policy.kind === 'read',
    destructiveHint: policy.kind === 'destructive',
    openWorldHint: policy.openWorld === true,
  }
}

// ---------------------------------------------------------------------------------------------------------
// Arguments

export const MIN_TAX_YEAR = 2000
/** As `ParseTaxYearPipe`: up to next year, so a return can be started before the year ends. */
export const maxTaxYear = (now: Date = new Date()): number => now.getFullYear() + 1

/** A tax year: the same range the REST routes accept (MCP-2). No year 0 and no year 9999. */
export function taxYearArg(now: Date = new Date()) {
  const max = maxTaxYear(now)
  return z.number().int().min(MIN_TAX_YEAR).max(max).describe(`Das Steuerjahr, ${MIN_TAX_YEAR} bis ${max}; welche Jahre der Nutzer hat, nennt steuerjahre_auflisten`)
}

export const MAX_ID_LENGTH = 64
export const MAX_FIELD_LENGTH = 100
/** The longest value a field of the catalogue holds (free text such as remarks) with room to spare. */
export const MAX_VALUE_LENGTH = 2000

export const screenArg = (description = 'Die Erfassungsmaske; ihre Felder nennt maske_felder') => z.enum(SCREENS).describe(description)
export const instanceArg = (description: string) => z.string().trim().min(1).max(MAX_ID_LENGTH).describe(description)
export const fieldArg = (description = 'Der Feldbezeichner, wie maske_felder ihn nennt') => z.string().max(MAX_FIELD_LENGTH).describe(description)
export const valueArg = (description: string) => z.string().max(MAX_VALUE_LENGTH).describe(description)
export const receiptIdArg = () => z.string().trim().min(1).max(MAX_ID_LENGTH).describe('Die belegId eines eigenen Belegs aus belege_auflisten oder beleg_hochladen, als Herkunftsnachweis')
export const PERSON_HINT = 'Bei Zusammenveranlagung: A der Nutzer, B Ehegatte oder Ehegattin. Pflicht in den Masken lstb, chLohnausweis, commute, rente, profil, stammdaten, sobald es Person B gibt.'
export const personArg = (description: string = PERSON_HINT) => z.enum(['A', 'B']).describe(description)

/** A map of field → value with at most `max` entries; the bound is published as JSON Schema `maxProperties`. */
export function boundedRecord<V extends z.ZodType>(key: z.ZodString, value: V, max: number) {
  return z
    .record(key, value)
    .refine((entries) => Object.keys(entries).length >= 1 && Object.keys(entries).length <= max, { message: `1 bis ${max} Einträge` })
    .meta({ minProperties: 1, maxProperties: max })
}

/**
 * The arguments of a tool that accept unbounded input: a string without a maximum length, a number without
 * both limits, an array or a map without a maximum size. Empty for a well-formed tool (the lock of P4).
 */
export function unboundedArguments(shape: Readonly<Record<string, z.ZodType>>): string[] {
  const out: string[] = []
  for (const [name, schema] of Object.entries(shape)) collectUnbounded(schema, name, out)
  return out
}

interface IntrospectedDef {
  readonly type: string
  readonly checks?: readonly { _zod: { def: { check: string } } }[]
  readonly innerType?: z.ZodType
  readonly element?: z.ZodType
  readonly shape?: Readonly<Record<string, z.ZodType>>
  readonly keyType?: z.ZodType
  readonly valueType?: z.ZodType
  readonly options?: readonly z.ZodType[]
  readonly in?: z.ZodType
}

function collectUnbounded(schema: z.ZodType, path: string, out: string[]): void {
  const def = (schema as unknown as { _zod: { def: IntrospectedDef } })._zod.def
  const has = (check: string) => (def.checks ?? []).some((c) => c._zod.def.check === check)
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
    case 'nonoptional':
    case 'catch':
      return collectUnbounded(def.innerType!, path, out)
    case 'pipe':
      return collectUnbounded(def.in!, path, out)
    case 'boolean':
    case 'enum':
    case 'literal':
    case 'null':
      return
    case 'string':
      if (!has('max_length') && !has('length_equals')) out.push(path)
      return
    case 'number':
      if (!has('greater_than') || !has('less_than')) out.push(path)
      return
    case 'array':
      if (!has('max_length')) out.push(path)
      return collectUnbounded(def.element!, `${path}[]`, out)
    case 'object':
      for (const [key, value] of Object.entries(def.shape ?? {})) collectUnbounded(value, `${path}.${key}`, out)
      return
    case 'record': {
      const meta = (schema as unknown as { meta(): Record<string, unknown> | undefined }).meta()
      if (typeof meta?.maxProperties !== 'number') out.push(path)
      collectUnbounded(def.keyType!, `${path}{key}`, out)
      return collectUnbounded(def.valueType!, `${path}{value}`, out)
    }
    case 'union':
      for (const option of def.options ?? []) collectUnbounded(option, path, out)
      return
    default:
      out.push(`${path} (${def.type})`)
  }
}

// ---------------------------------------------------------------------------------------------------------
// Results

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
 * before, `code` is the code alone and `naechsterSchritt` says what to do instead.
 */
export function refused(error: string, nextStep?: string): ToolResult {
  const match = CODE_PATTERN.exec(error.trim())
  const code = match?.[1] ?? 'REFUSED'
  const text = match ? error.trim() : `${code}: ${error.trim()}`
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ ok: false, code, error: text, naechsterSchritt: nextStep ?? NEXT_STEPS[code] ?? DEFAULT_NEXT_STEP }, null, 2) }],
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

/** A result a tool built as `{ ok: false, … }` without flagging it: flagged, with a code and a next step (MCP-19). */
export function normalisedResult(result: unknown): ToolResult {
  const candidate = result as ToolResult | undefined
  const text = candidate?.content?.[0]?.type === 'text' ? candidate.content[0].text : undefined
  if (candidate === undefined || text === undefined) return candidate ?? refused('INTERNAL_ERROR: Das Werkzeug gab nichts zurück.')
  const looksRefused = candidate.isError === true || text.includes('"ok": false')
  if (!looksRefused) return candidate
  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(text)
    body = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    body = null
  }
  if (body === null) return refused(text)
  if (body.ok !== false && candidate.isError !== true) return candidate
  if (typeof body.code === 'string' && typeof body.naechsterSchritt === 'string') return { ...candidate, isError: true }
  const reason = [body.error, body.grund, body.reason, body.hinweis].find((value): value is string => typeof value === 'string') ?? 'Das ging nicht.'
  const code = typeof body.code === 'string' ? body.code : CODE_PATTERN.exec(reason)?.[1] ?? 'NOT_POSSIBLE'
  return refused(CODE_PATTERN.test(reason) ? reason : `${code}: ${reason}`)
}

// ---------------------------------------------------------------------------------------------------------
// The gate

export interface ToolGateContext {
  readonly userId: string
  readonly assistant: AssistantSessionInfo
  readonly limiter: Pick<McpRateLimiter, 'takeToolCallEverywhere' | 'takePrintoutCheck' | 'limits'>
  readonly audit: Pick<AuditService, 'append'>
}

type ToolHandler = (args: Record<string, unknown>, extra: unknown) => unknown

const logger = new Logger('McpTools')

/**
 * Every tool registered on this server from now on passes here (one place, so no tool can forget a step):
 * its policy and bounded arguments are checked when it is registered; each call is limited, audited with
 * the assistant, scope-checked and answered in one shape. Registration takes the four-argument form
 * `server.tool(name, description, shape, handler)`.
 */
export function installToolGate(server: McpServer, context: ToolGateContext): void {
  const { userId, assistant, limiter, audit } = context
  const source = assistantAuditSource(assistant.clientId)
  const register = server.registerTool.bind(server) as (name: string, config: Record<string, unknown>, handler: ToolHandler) => unknown

  const gated = (name: string, description: string, shape: Record<string, z.ZodType>, handler: ToolHandler): unknown => {
    const policy = TOOL_POLICIES[name]
    if (policy === undefined) throw new Error(`MCP tool "${name}" has no entry in TOOL_POLICIES.`)
    if (typeof handler !== 'function' || typeof description !== 'string') throw new Error(`MCP tool "${name}" must be registered as tool(name, description, shape, handler).`)
    const unbounded = unboundedArguments(shape)
    if (unbounded.length > 0) throw new Error(`MCP tool "${name}" takes unbounded arguments: ${unbounded.join(', ')}.`)

    const guarded: ToolHandler = async (args, extra) => {
      const gate = await limiter.takeToolCallEverywhere(userId)
      if (!gate.ok) {
        // The first refusal of a blocked stretch only: a client hammering the endpoint writes no stream of rows.
        if (gate.first) await audit.append({ userId, action: 'READ', resource: 'mcp_rate_limited', source }).catch(() => undefined)
        return rateLimitRefusal(gate.retryAfterSeconds, limiter.limits.toolCallsPerMinute)
      }
      try {
        await audit.append({ userId, action: policy.kind === 'read' ? 'READ' : 'WRITE', resource: name, source })
        if (!hasScope(assistant, policy.scope)) {
          return refused(`MISSING_SCOPE: Dem Assistenten wurde die Berechtigung „${policy.scope}“ nicht erteilt; ${name} braucht sie.`)
        }
        if (policy.rendersPrintout) {
          const budget = await limiter.takePrintoutCheck(userId)
          if (!budget.ok) return refused(`PRINTOUT_BUDGET: Die Ausdruck-Prüfung lief in der letzten Minute schon oft. Versuch es in ${budget.retryAfterSeconds} Sekunden wieder.`)
        }
        return normalisedResult(await runWithAuditSource(source, () => handler(args, extra)))
      } catch (error) {
        return refusalOfError(error, (message) => logger.error(`${name}: ${message}`))
      }
    }
    return register(name, { title: policy.title, description, inputSchema: shape, annotations: annotationsOf(policy) }, guarded)
  }
  server.tool = gated as unknown as McpServer['tool']
  // Arguments that fail the schema and unknown tools are answered by the SDK itself: in the same shape.
  ;(server as unknown as { createToolError: (message: string) => ToolResult }).createToolError = refusalOfProtocolError
}

/** The German refusal of a call over the limit. */
export const rateLimitRefusal = (retryAfterSeconds: number, perMinute: number): ToolResult =>
  refused(`RATE_LIMITED: Zu viele Werkzeugaufrufe (höchstens ${perMinute} je Minute). Versuch es in ${retryAfterSeconds} Sekunden wieder und fasse Einträge mit maske_eintragen_stapel zusammen.`)

// ---------------------------------------------------------------------------------------------------------
// Instructions

/** What a client is told on `initialize` (MCP-10): the workflow in a few lines, and where to start. */
export const SERVER_INSTRUCTIONS = [
  'SteuerEule hilft dem Nutzer bei seiner deutschen Einkommensteuererklärung. Du trägst ein, der Nutzer prüft und bestätigt in der App.',
  'Ablauf: 1. steuerjahre_auflisten nennt die Steuerjahre des Nutzers. 2. haushalt_ueberblick ordnet den Fall ein. 3. maske_felder beschreibt die Felder einer Maske; feld_finden sucht ein Feld. 4. Werte mit maske_eintragen oder maske_eintragen_stapel eintragen; alles bleibt unbestätigt, bis der Nutzer es in der App bestätigt. 5. steuerbericht und pruefen sagen, was fehlt; offene_fragen nennt, was nur der Nutzer weiß. 6. Was nur der Nutzer kann, als aufgabe_fuer_nutzer hinterlassen.',
  'Regeln: Erfinde keine Werte. Eigene Fehler nimmst du mit eintrag_zuruecknehmen, kind_entfernen, vermietung_entfernen, beleg_zuruecknehmen oder aufgabe_zuruecknehmen zurück. Bezahlen, Einwilligungen und Kontoänderungen macht nur der Nutzer.',
  'Jede Ablehnung kommt mit isError, einem Code und einem nächsten Schritt.',
].join('\n')
