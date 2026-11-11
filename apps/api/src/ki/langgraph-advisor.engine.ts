import { randomUUID } from 'node:crypto'
import { newActionId } from '../common/action-id.js'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
  type UsageMetadata,
} from '@langchain/core/messages'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { concat } from '@langchain/core/utils/stream'
import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from '@langchain/langgraph'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { z } from 'zod'
import {
  ADVISOR_LEGAL_SOURCES,
  ADVISOR_PLAN_MAX_STEPS,
  ADVISOR_PLAN_STEP_STATUSES,
  checkAdvisorInputBoundary,
  evaluateAdvisorTurn,
  simulateAdvisorFieldDelta,
  type AdvisorActionProposal,
  type AdvisorEnginePort,
  type AdvisorMessageMeta,
  type AdvisorStreamEvent,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
  type AdvisorTurnUsage,
  type AdvisorTwoPathsProposal,
  type CaseDigest,
  type OwlSourceId,
  type Screen,
} from '@steuereule/core'
import {
  AI_RUNTIME_CONFIG_SERVICE,
  DEFAULT_AI_TURN_LIMITS,
  type AiRuntimeConfigService,
  type AiTurnLimits,
  type ResolvedAiSlotConfig,
} from './ai-runtime-config.service.js'
import {
  CHAT_MODEL_FACTORY,
  createChatModelFromConfig,
  type ChatModelFactory,
} from './chat-model.factory.js'
import { checkStageValue, describeAiWritableFields, normalizeSourceId, validateStageTarget, type StageTargetCheck } from './advisor-safety.js'
import { checkPiiFree } from './ki.adapter.js'

export const ADVISOR_ENGINE = Symbol('ADVISOR_ENGINE')

const MAX_COMPANION_FIELDS = 3

const TOOL_LABELS: Readonly<Record<string, string>> = {
  simulate_tax_delta: 'Simuliere Vorher/Nachher-Steuerwirkung …',
  stage_field_draft: 'Bereite sicheren Entwurf vor …',
  propose_two_paths: 'Vergleiche Zwei-Wege-Strategien …',
  ask_clarification: 'Prüfe Rückfragen …',
  lookup_legal_source: 'Prüfe EStG-Paragraph …',
  plan_steps: 'Plane die nächsten Schritte …',
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text
      }
      return ''
    })
    .join('')
}

/**
 * The reasoning summary a provider attached to a chunk, in any of the shapes they use: Anthropic and
 * Gemini `thinking` parts, LangChain's standard `reasoning` blocks, OpenAI's summary list. Encrypted
 * or redacted reasoning has no text and yields nothing.
 */
export function extractReasoningText(message: { content: unknown; additional_kwargs?: Record<string, unknown> | undefined }): string {
  const fromSummary = (summary: unknown): string =>
    Array.isArray(summary)
      ? summary.map((item) => (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : '')).join('')
      : ''

  let text = ''
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== 'object') continue
      const block = part as { type?: unknown; thinking?: unknown; reasoning?: unknown; summary?: unknown }
      if (block.type === 'thinking' && typeof block.thinking === 'string') text += block.thinking
      else if (block.type === 'reasoning' && typeof block.reasoning === 'string') text += block.reasoning
      else if (block.type === 'reasoning') text += fromSummary(block.summary)
    }
  }
  const kwargs = message.additional_kwargs
  if (kwargs) {
    const reasoning = kwargs.reasoning
    if (reasoning && typeof reasoning === 'object') text += fromSummary((reasoning as { summary?: unknown }).summary)
    if (typeof kwargs.reasoning_content === 'string') text += kwargs.reasoning_content
  }
  return text
}

function sumUsage(messages: readonly BaseMessage[]): AdvisorTurnUsage | undefined {
  let seen = false
  let inputTokens = 0
  let outputTokens = 0
  let cachedInputTokens = 0
  for (const message of messages) {
    const usage = (message as { usage_metadata?: UsageMetadata | undefined }).usage_metadata
    if (!usage) continue
    seen = true
    inputTokens += usage.input_tokens ?? 0
    outputTokens += usage.output_tokens ?? 0
    cachedInputTokens += usage.input_token_details?.cache_read ?? 0
  }
  return seen ? { inputTokens, outputTokens, cachedInputTokens } : undefined
}

/**
 * The part of the system prompt that is the same for every user and every turn. It comes first so
 * providers can cache it as a prefix (#476); nothing case-specific may ever move in here.
 */
export function buildStableSystemPrompt(): string {
  const sourceCatalog = Object.values(ADVISOR_LEGAL_SOURCES)
    .map((s) => `- ${s.sourceId} (${s.paragraph}): ${s.title}`)
    .join('\n')

  return [
    'Du bist die "SteuerEule", der ruhige, fachlich präzise Kanzlei-KI-Assistent von SteuerEule für die deutsche Einkommensteuer.',
    'Arbeitsmodus: App-Agent im dedizierten Eulen-Modus (Zero-Write-Prinzip). Du schreibst NIEMALS direkt in die Steuerakte, sondern erstellst über das Tool `stage_field_draft` oder `propose_two_paths` unverbindliche Entwürfe zur Freigabe durch den Nutzer.',
    '',
    'Strikte Leitplanken (unverhandelbar):',
    '1. Nur private Einkommensteuererklärung (Anlage N, N-Gre, KAP, V, R, Kind, Sonderausgaben). Verweise bei Gewerbesteuer, UStVA, Bilanzierung, Erbschaftsteuer oder verbindlicher Rechtsauskunft nach StBerG freundlich an Steuerberatung/Lohnsteuerhilfeverein.',
    '2. Gesperrte Felder/Masken (`profil`, `stammdaten`, `kopplung`, `commute.workplace`, Namen, Steuer-IDs, IBAN, Geburtsdaten) sind absolut tabu und dürfen niemals als Entwurf vorgeschlagen werden.',
    '3. Behaupte niemals eigene Euro-Schätzungen ohne Berechnung: nutze `simulate_tax_delta`, `stage_field_draft` oder `propose_two_paths`. Bei Werbungskosten unter dem Arbeitnehmer-Pauschbetrag (1.230 €) erkläre ehrlich den Pauschbetrag statt falscher Erstattung.',
    '4. Zitiere Rechtsgrundlagen nur mit `[sourceId]` aus folgendem Katalog:',
    sourceCatalog,
    '',
    '5. Plan: Braucht eine Aufgabe mehrere Schritte (z. B. „Was hab ich vergessen?“ oder mehrere Bereiche prüfen), lege mit `plan_steps` eine kurze Liste an (höchstens 8 Schritte) und rufe `plan_steps` bei jedem Fortschritt mit der vollständigen Liste und neuen Status auf (`offen`, `laeuft`, `erledigt`). Einfache Fragen beantwortest du direkt, ohne Plan. Ein Plan schreibt nie etwas: Änderungen bleiben Entwürfe über `stage_field_draft`.',
    '',
    '6. Felder: Für `screen` und `field` gelten ausschließlich die folgenden Namen. Die Namen im Fall-Überblick (CaseDigest) sind KEINE Feldnamen. Gehören mehrere Werte zusammen (z. B. die drei Beträge der Lohnsteuerbescheinigung), lege EINEN Entwurf an und gib die übrigen als `companionFields` mit (höchstens 3). Meldet ein Werkzeug UNKNOWN_FIELD, nimm einen Namen aus der Liste, die es nennt.',
    describeAiWritableFields(),
    '',
    '7. Arbeitsweise: `stage_field_draft` und `propose_two_paths` rechnen die Steuerwirkung selbst aus; rufe `simulate_tax_delta` nur auf, wenn du Varianten vergleichen willst, ohne einen Entwurf anzulegen. Behaupte nie, einen Entwurf vorbereitet zu haben, wenn das Werkzeug nicht `ok: true` gemeldet hat. Schließe jede Antwort mit einem kurzen Text ab.',
    '',
    '10. Vollständigkeit vor Tempo: (a) Arbeitsweg: Frage nach Urlaubs- und Krankheitstagen (`commute.vacationDays`, `commute.sickDays`), bevor du Pendeltage oder eine Entfernungspauschale als fertig bezeichnest; ohne sie rechnet die App mit 0 Tagen und überschätzt die Pauschale. Sage das, wenn die Angaben fehlen. (b) Fortbildung: Nennt der Nutzer Kosten, lege den Entwurf auf `interview.fortbildung-kosten` an und gib `fortbildung: "Ja"` als companionField mit. Ohne Betrag vermerkst du nur `fortbildung` = „Ja“ und fragst nach den Kosten; nenne dafür keine Erstattungswirkung. (c) Nenne Beträge nur dann als erfasst, wenn ein Entwurf dafür `ok: true` gemeldet hat.',
    '',
    '8. Ton: Du duzt den Nutzer durchgehend, freundlich und knapp.',
    '',
    '9. Gesprächsverlauf: Zeilen der Form `[Vorschlag „…“ → …: Status]` in früheren Antworten beschreiben deine eigenen Entwürfe und was der Nutzer damit gemacht hat. Wiederhole keinen Vorschlag, der schon übernommen oder verworfen wurde, und schreibe solche Zeilen nie selbst.',
  ].join('\n')
}

function buildCaseSystemPrompt(digest: CaseDigest, activeScreen: Screen | undefined, planFirst: boolean): string {
  return [
    `Aktive Maske: ${activeScreen ?? 'cockpit'}`,
    'PII-freier Fall-Überblick (CaseDigest):',
    JSON.stringify(digest),
    ...(planFirst ? ['', 'Für diese Anfrage gilt: Rufe als Erstes `plan_steps` auf, bevor du irgendetwas anderes tust.'] : []),
  ].join('\n')
}

/**
 * Stable rules first, the case second. Anthropic caches only what is marked, so there the stable
 * block carries an explicit cache breakpoint; the other providers cache a repeated prefix on their own.
 */
export function buildSystemMessage(
  provider: string,
  digest: CaseDigest,
  activeScreen?: Screen,
  /** Ask for the plan in words, for models that cannot be forced to a tool (see `canForceTool`). */
  planFirst = false,
): SystemMessage {
  const stable = buildStableSystemPrompt()
  const caseSpecific = buildCaseSystemPrompt(digest, activeScreen, planFirst)
  if (provider === 'anthropic') {
    return new SystemMessage({
      content: [
        { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: caseSpecific },
      ],
    })
  }
  return new SystemMessage(`${stable}\n\n${caseSpecific}`)
}

const AdvisorGraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  toolRounds: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  pendingAction: Annotation<AdvisorActionProposal | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  pendingTwoPaths: Annotation<AdvisorTwoPathsProposal | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  choices: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  sources: Annotation<OwlSourceId[]>({
    reducer: (left, right) => [...new Set([...left, ...right])],
    default: () => [],
  }),
})

const draftTargetSchema = z.object({
  screen: z.string().max(40),
  field: z.string().max(100),
  newValue: z.string().max(200),
  label: z.string().max(160),
  reason: z.string().max(400).default(''),
})

/** One schema per tool: the model sees it via bindTools, and toolsNode parses every call with it. */
const TOOL_ARG_SCHEMAS = {
  simulate_tax_delta: z.object({
    screen: z.string().max(40),
    field: z.string().max(100),
    newValue: z.string().max(200),
  }),
  stage_field_draft: draftTargetSchema.extend({
    instance: z.string().max(80).nullable().optional(),
    sourceId: z.string().max(40).default('estg-9-1'),
    companionFields: z.record(z.string().max(100), z.string().max(200)).optional(),
  }),
  propose_two_paths: z.object({
    title: z.string().max(160),
    sourceId: z.string().max(40).default('estg-4-5-6c'),
    safePath: draftTargetSchema,
    maxPath: draftTargetSchema.extend({ evidenceHint: z.string().max(260).default('Bitte entsprechenden Nachweis aufbewahren.') }),
  }),
  ask_clarification: z.object({
    choices: z.array(z.string().max(120)).min(1).max(4),
  }),
  lookup_legal_source: z.object({
    sourceId: z.string().max(40),
  }),
  plan_steps: z.object({
    steps: z
      .array(z.object({ text: z.string().min(1).max(120), status: z.enum(ADVISOR_PLAN_STEP_STATUSES) }))
      .min(1)
      .max(ADVISOR_PLAN_MAX_STEPS),
  }),
} as const

type ToolName = keyof typeof TOOL_ARG_SCHEMAS

const TOOL_DESCRIPTIONS: Readonly<Record<ToolName, string>> = {
  simulate_tax_delta:
    'Simuliert deterministisch die exakte Vorher/Nachher-Erstattungswirkung eines Feldes ohne etwas in der Datenbank zu ändern.',
  stage_field_draft:
    'Erstellt einen unverbindlichen Feld-Entwurf (Status pending) zur Prüfung und Freigabe im Eulen-Modus. Rechnet das Steuerdelta deterministisch aus.',
  propose_two_paths:
    'Stellt zwei Alternativen (Sicher-Weg vs. Maximal-Weg mit Nachweishinweis) zur Auswahl durch den Nutzer gegenüber.',
  ask_clarification: 'Schlägt 2 bis 4 anklickbare Quick-Chips als nächste Rückfragen im Chat vor.',
  lookup_legal_source: 'Ruft Wortlaut, Paragraph und Rechtsstand einer EStG/AO-Rechtsquelle aus dem verifizierten Katalog ab.',
  plan_steps:
    'Zeigt dem Nutzer deinen Plan als Checkliste (höchstens 8 Schritte, Status offen/laeuft/erledigt). Immer die vollständige Liste senden. Schreibt nichts in die Akte.',
}

/** JSON Schema keywords at least one provider's function-calling API rejects outright. */
const UNSUPPORTED_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set(['$schema', 'propertyNames'])

/**
 * The tool schema as the model gets to see it. Gemini answers 400 to `propertyNames` (which every
 * `z.record` produces), and a rejected schema silently sent every turn to the deterministic
 * fallback. Nothing is lost by leaving such keywords out here: toolsNode validates every call
 * against the full Zod schema anyway.
 */
export function toProviderToolSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip)
    if (node === null || typeof node !== 'object') return node
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
        .map(([key, value]) => [key, strip(value)]),
    )
  }
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>
}

// The bodies are never invoked: toolsNode executes the calls itself so it can update graph state.
export function buildToolSchemas(): readonly StructuredToolInterface[] {
  return (Object.keys(TOOL_ARG_SCHEMAS) as ToolName[]).map((name) =>
    tool(async () => '', { name, description: TOOL_DESCRIPTIONS[name], schema: toProviderToolSchema(TOOL_ARG_SCHEMAS[name]) }),
  )
}

function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_ARG_SCHEMAS, name)
}

function toolResult(callId: string, name: string, payload: Record<string, unknown>): ToolMessage {
  return new ToolMessage({ tool_call_id: callId, name, content: JSON.stringify(payload) })
}

@Injectable()
export class LangGraphAdvisorEngine implements AdvisorEnginePort {
  private readonly resolveChatModel: ChatModelFactory
  private readonly logger = new Logger('AdvisorEngine')

  constructor(
    @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig: AiRuntimeConfigService,
    @Optional() @Inject(CHAT_MODEL_FACTORY) modelFactory?: ChatModelFactory,
  ) {
    this.resolveChatModel = modelFactory ?? createChatModelFromConfig
  }

  private buildCompiledGraph(
    model: BaseChatModel,
    request: AdvisorTurnRequest,
    maxToolRounds: number,
    canForceTool: boolean,
  ) {
    const tools = buildToolSchemas()
    const bind = typeof model.bindTools === 'function' ? model.bindTools.bind(model) : null
    const boundModel = bind ? bind([...tools]) : model
    // The quick start „Was hab ich vergessen?“ must open with a plan (decision 17): only the first
    // round is forced, later rounds are free to work through the steps and answer.
    const planFirstModel = bind && request.planRequired && canForceTool ? bind([...tools], { tool_choice: 'plan_steps' }) : boundModel
    const answerOnlyModel = bind ? bind([...tools], { tool_choice: 'none' }) : model
    const makeActionId = request.actionIdFactory ?? (newActionId)

    const agentNode = async (
      state: typeof AdvisorGraphState.State,
      config?: LangGraphRunnableConfig,
    ) => {
      let aggregated: AIMessageChunk | null = null
      let lastFallbackMsg: AIMessage | null = null

      // After the last tool round the model has to answer in words: with tools still on offer it
      // may ask for yet another one, and the turn would end without any text.
      const roundModel = state.toolRounds === 0 ? planFirstModel : state.toolRounds >= maxToolRounds ? answerOnlyModel : boundModel
      const streamOrValue = await roundModel.stream(state.messages, config)
      for await (const chunk of streamOrValue) {
        if (chunk instanceof AIMessageChunk) {
          const thought = extractReasoningText(chunk)
          if (thought.length > 0) {
            config?.writer?.({ event: 'reasoning', data: { text: thought } } satisfies AdvisorStreamEvent)
          }
          const text = extractMessageText(chunk.content)
          if (text.length > 0) {
            config?.writer?.({ event: 'token', data: { text } } satisfies AdvisorStreamEvent)
          }
          aggregated = aggregated ? concat(aggregated, chunk) : chunk
        } else {
          lastFallbackMsg = chunk as unknown as AIMessage
          const text = extractMessageText(lastFallbackMsg.content)
          if (text.length > 0) {
            config?.writer?.({ event: 'token', data: { text } } satisfies AdvisorStreamEvent)
          }
        }
      }

      const finalMsg: BaseMessage =
        aggregated ??
        lastFallbackMsg ??
        new AIMessage('Ich habe deine Angaben geprüft, konnte aber keine Antwort erzeugen.')

      return { messages: [finalMsg] }
    }

    const toolsNode = async (
      state: typeof AdvisorGraphState.State,
      config?: LangGraphRunnableConfig,
    ) => {
      const last = state.messages[state.messages.length - 1]
      const toolCalls =
        last && ('tool_calls' in last) && Array.isArray((last as AIMessage).tool_calls)
          ? (last as AIMessage).tool_calls!
          : []

      const toolMessages: ToolMessage[] = []
      let pendingAction = state.pendingAction
      let pendingTwoPaths = state.pendingTwoPaths
      let choices = state.choices
      const sources: OwlSourceId[] = []

      for (const tc of toolCalls) {
        config?.writer?.({
          event: 'tool',
          data: {
            name: tc.name,
            label: TOOL_LABELS[tc.name] ?? `Führe ${tc.name} aus …`,
          },
        } satisfies AdvisorStreamEvent)

        const callId = tc.id ?? `call-${randomUUID().slice(0, 8)}`
        if (!isToolName(tc.name)) {
          toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `UNKNOWN_TOOL: "${tc.name}" wird nicht unterstützt.` }))
          continue
        }
        const parseArgs = <S extends z.ZodTypeAny>(schema: S): z.infer<S> | null => {
          const parsed = schema.safeParse(tc.args ?? {})
          if (parsed.success) return parsed.data as z.infer<S>
          const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
          toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `INVALID_ARGUMENTS: ${fields}` }))
          return null
        }

        const rejectTarget = (target: Extract<StageTargetCheck, { ok: false }>): void => {
          // A locked field is not a dead end for the user: the workbench opens it for manual entry.
          if (target.locked) {
            config?.writer?.({
              event: 'ui_command',
              data: { openMask: target.locked.screen, focus: target.locked.field },
            } satisfies AdvisorStreamEvent)
          }
          toolMessages.push(toolResult(callId, tc.name, { ok: false, error: target.error }))
        }

        if (tc.name === 'simulate_tax_delta') {
          const args = parseArgs(TOOL_ARG_SCHEMAS.simulate_tax_delta)
          if (args === null) continue
          const { screen, field, newValue } = args
          const target = validateStageTarget(screen, field)
          if (!target.ok) {
            rejectTarget(target)
            continue
          }
          const simValue = checkStageValue(target.screen, field, newValue)
          if (!simValue.ok) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: simValue.error }))
            continue
          }
          const sim = simulateAdvisorFieldDelta(request.digest, target.screen, field.trim(), simValue.value)
          toolMessages.push(new ToolMessage({ tool_call_id: callId, name: tc.name, content: JSON.stringify({ ok: true, ...sim }) }))
          continue
        }

        if (tc.name === 'stage_field_draft') {
          const args = parseArgs(TOOL_ARG_SCHEMAS.stage_field_draft)
          if (args === null) continue
          const { screen, field, label, reason } = args
          const instance = args.instance && args.instance.trim().length > 0 ? args.instance.trim() : null
          const sourceId = normalizeSourceId(args.sourceId)
          const rawCompanions = Object.entries(args.companionFields ?? {}).map(([k, v]) => [k.trim(), v] as const)

          const target = validateStageTarget(screen, field)
          if (!target.ok) {
            rejectTarget(target)
            continue
          }
          if (rawCompanions.length > MAX_COMPANION_FIELDS) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `INVALID_ARGUMENTS: höchstens ${MAX_COMPANION_FIELDS} Begleitfelder.` }))
            continue
          }
          // Companion fields are written with the same rights as the main field, so they pass the same gate.
          const lockedCompanion = rawCompanions
            .map(([companionField]) => validateStageTarget(screen, companionField))
            .find((check): check is Extract<StageTargetCheck, { ok: false }> => !check.ok)
          if (lockedCompanion) {
            rejectTarget(lockedCompanion)
            continue
          }
          // Every value is checked against the field catalogue and stored in its tidied form: a
          // draft that could not be applied is refused here, with the reason, instead of being made.
          const checkedValues = [[field.trim(), args.newValue] as const, ...rawCompanions].map(([name, value]) => ({ name, check: checkStageValue(screen, name, value) }))
          const badValue = checkedValues.find((entry) => !entry.check.ok)
          if (badValue && !badValue.check.ok) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: badValue.check.error }))
            continue
          }
          const tidy = (name: string): string => {
            const entry = checkedValues.find((candidate) => candidate.name === name)!
            return entry.check.ok ? entry.check.value : ''
          }
          const newValue = tidy(field.trim())
          const companionEntries = rawCompanions.map(([name]) => [name, tidy(name)] as const)
          const companionFields = companionEntries.length > 0 ? Object.fromEntries(companionEntries) : undefined

          try {
            checkPiiFree({ newValue, label, reason, companionFields: companionFields ?? {} })
          } catch (error) {
            toolMessages.push(
              new ToolMessage({
                tool_call_id: callId,
                name: tc.name,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : 'PII boundary rejected draft payload.',
                }),
              }),
            )
            continue
          }

          const cleanField = field.trim()
          const sim = simulateAdvisorFieldDelta(request.digest, target.screen, cleanField, newValue)
          sources.push(sourceId)

          pendingAction = {
            actionId: makeActionId(),
            status: 'pending',
            screen: target.screen,
            field: cleanField,
            instance,
            ...(companionFields ? { companionFields } : {}),
            label,
            previousValue: sim.previousValue,
            expectedPreviousValue: sim.previousValue,
            newValue,
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason,
            sourceId,
            paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
          }

          toolMessages.push(toolResult(callId, tc.name, { ok: true, stagedAction: pendingAction }))
          continue
        }

        if (tc.name === 'propose_two_paths') {
          const args = parseArgs(TOOL_ARG_SCHEMAS.propose_two_paths)
          if (args === null) continue
          const title = args.title
          const sourceId = normalizeSourceId(args.sourceId)
          const rawSafe = args.safePath
          const rawMax = args.maxPath

          const safeCheck = validateStageTarget(rawSafe.screen, rawSafe.field)
          if (!safeCheck.ok) {
            rejectTarget(safeCheck)
            continue
          }
          const maxCheck = validateStageTarget(rawMax.screen, rawMax.field)
          if (!maxCheck.ok) {
            rejectTarget(maxCheck)
            continue
          }

          const safeField = rawSafe.field.trim()
          const maxField = rawMax.field.trim()
          const safeValue = checkStageValue(safeCheck.screen, safeField, rawSafe.newValue)
          const maxValue = checkStageValue(maxCheck.screen, maxField, rawMax.newValue)
          if (!safeValue.ok || !maxValue.ok) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: !safeValue.ok ? safeValue.error : !maxValue.ok ? maxValue.error : '' }))
            continue
          }
          const safeNewValue = safeValue.value
          const maxNewValue = maxValue.value

          try {
            checkPiiFree({ safeNewValue, maxNewValue, title, safeLabel: rawSafe.label, maxLabel: rawMax.label })
          } catch (error) {
            toolMessages.push(
              new ToolMessage({
                tool_call_id: callId,
                name: tc.name,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : 'PII boundary rejected twoPaths payload.',
                }),
              }),
            )
            continue
          }

          const safeSim = simulateAdvisorFieldDelta(request.digest, safeCheck.screen, safeField, safeNewValue)
          const maxSim = simulateAdvisorFieldDelta(request.digest, maxCheck.screen, maxField, maxNewValue)
          const baseActionId = makeActionId()
          sources.push(sourceId)

          pendingTwoPaths = {
            title,
            sourceId,
            safePath: {
              actionId: `${baseActionId}-safe`,
              status: 'pending',
              screen: safeCheck.screen,
              field: safeField,
              instance: null,
              label: rawSafe.label,
              previousValue: safeSim.previousValue,
              expectedPreviousValue: safeSim.previousValue,
              newValue: safeNewValue,
              beforeRefundEur: safeSim.beforeRefundEur,
              afterRefundEur: safeSim.afterRefundEur,
              deltaEur: safeSim.deltaEur,
              reason: rawSafe.reason,
              sourceId,
              paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
            },
            maxPath: {
              actionId: `${baseActionId}-max`,
              status: 'pending',
              screen: maxCheck.screen,
              field: maxField,
              instance: null,
              label: rawMax.label,
              previousValue: maxSim.previousValue,
              expectedPreviousValue: maxSim.previousValue,
              newValue: maxNewValue,
              beforeRefundEur: maxSim.beforeRefundEur,
              afterRefundEur: maxSim.afterRefundEur,
              deltaEur: maxSim.deltaEur,
              reason: rawMax.reason,
              evidenceHint: rawMax.evidenceHint,
              sourceId,
              paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
            },
          }

          toolMessages.push(toolResult(callId, tc.name, { ok: true, twoPaths: pendingTwoPaths }))
          continue
        }

        if (tc.name === 'ask_clarification') {
          const args = parseArgs(TOOL_ARG_SCHEMAS.ask_clarification)
          if (args === null) continue
          choices = args.choices.map((c) => c.trim()).filter((c) => c.length > 0)
          toolMessages.push(toolResult(callId, tc.name, { ok: true, choices }))
          continue
        }

        if (tc.name === 'plan_steps') {
          const args = parseArgs(TOOL_ARG_SCHEMAS.plan_steps)
          if (args === null) continue
          const steps = args.steps.map((step) => ({ text: step.text.trim(), status: step.status }))
          try {
            checkPiiFree({ steps })
          } catch (error) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: error instanceof Error ? error.message : 'PII boundary rejected plan.' }))
            continue
          }
          config?.writer?.({ event: 'plan', data: { steps } } satisfies AdvisorStreamEvent)
          toolMessages.push(toolResult(callId, tc.name, { ok: true, shown: steps.length }))
          continue
        }

        const lookupArgs = parseArgs(TOOL_ARG_SCHEMAS.lookup_legal_source)
        if (lookupArgs === null) continue
        const sourceId = normalizeSourceId(lookupArgs.sourceId)
        sources.push(sourceId)
        toolMessages.push(toolResult(callId, tc.name, { ok: true, source: ADVISOR_LEGAL_SOURCES[sourceId] }))
      }

      return {
        messages: toolMessages,
        toolRounds: state.toolRounds + 1,
        pendingAction,
        pendingTwoPaths,
        choices,
        sources,
      }
    }

    const shouldContinue = (state: typeof AdvisorGraphState.State) => {
      if (state.toolRounds >= maxToolRounds) return END
      const last = state.messages[state.messages.length - 1]
      const toolCalls =
        last && 'tool_calls' in last && Array.isArray((last as AIMessage).tool_calls)
          ? (last as AIMessage).tool_calls
          : undefined
      if (toolCalls && toolCalls.length > 0) return 'tools'
      return END
    }

    return new StateGraph(AdvisorGraphState)
      .addNode('agent', agentNode)
      .addNode('tools', toolsNode)
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', shouldContinue, ['tools', END])
      .addEdge('tools', 'agent')
      .compile()
  }

  private async *emitFallbackTurn(
    request: AdvisorTurnRequest,
    override?: { replyText: string; meta: AdvisorMessageMeta },
  ): AsyncIterable<AdvisorStreamEvent> {
    const turn =
      override ??
      evaluateAdvisorTurn({
        message: request.message,
        activeScreen: request.activeScreen,
        digest: request.digest,
        actionIdFactory: request.actionIdFactory,
      })

    yield { event: 'token', data: { text: turn.replyText } }
    if (turn.meta.choices && turn.meta.choices.length > 0) {
      yield { event: 'choices', data: { choices: turn.meta.choices } }
    }
    if (turn.meta.action) {
      yield { event: 'action', data: turn.meta.action }
    }
    if (turn.meta.twoPaths) {
      yield { event: 'twoPaths', data: turn.meta.twoPaths }
    }
    const result: AdvisorTurnResult = {
      replyText: turn.replyText,
      meta: turn.meta,
      mode: 'deterministic_fallback',
      provider: 'deterministic',
      model: 'deterministic-fallback',
    }
    yield { event: 'done', data: result }
  }

  async *streamTurn(request: AdvisorTurnRequest): AsyncIterable<AdvisorStreamEvent> {
    // Zero-trust PII gate before ANY LLM or fallback branch runs
    checkPiiFree({
      digest: request.digest,
      history: request.history ?? [],
      message: request.message,
    })

    yield { event: 'status', data: { text: 'Eule prüft deine Akte & Paragraphen …' } }

    // Pre-LLM StBerG & prompt-injection boundary check
    const boundary = checkAdvisorInputBoundary(request.message)
    if (boundary !== null) {
      yield* this.emitFallbackTurn(request, boundary)
      return
    }

    let slotConfig: ResolvedAiSlotConfig | null = null
    let chatModel: BaseChatModel | null = null
    let limits: AiTurnLimits = DEFAULT_AI_TURN_LIMITS

    try {
      limits = await this.runtimeConfig.resolveLimits()
      if (!(await this.runtimeConfig.isKillSwitchActive())) {
        slotConfig = await this.runtimeConfig.resolveSlot('advisor_chat')
        chatModel = this.resolveChatModel(slotConfig)
      }
    } catch {
      chatModel = null
    }

    if (!chatModel || !slotConfig || !slotConfig.enabled || slotConfig.provider === 'deterministic') {
      yield* this.emitFallbackTurn(request)
      return
    }

    // Anthropic rejects a forced tool call while extended thinking is on; the plan is then asked for in words.
    const canForceTool = !(slotConfig.provider === 'anthropic' && slotConfig.reasoning === 'summary')
    const systemMessage = buildSystemMessage(
      slotConfig.provider,
      request.digest,
      request.activeScreen,
      request.planRequired === true && !canForceTool,
    )
    const historyMessages: BaseMessage[] = (request.history ?? []).map((entry) =>
      entry.role === 'user' ? new HumanMessage(entry.content) : new AIMessage(entry.content),
    )
    const initialMessages: BaseMessage[] = [systemMessage, ...historyMessages, new HumanMessage(request.message)]

    let streamedTokenCount = 0
    let streamedText = ''
    let reasoning = ''
    let reasoningRound = 0
    let lastReasoningRound = 0
    let finalMessages: BaseMessage[] = []
    let pendingAction: AdvisorActionProposal | null = null
    let pendingTwoPaths: AdvisorTwoPathsProposal | null = null
    let choices: string[] = []
    let sources: OwlSourceId[] = []

    const timeout = AbortSignal.timeout(limits.turnTimeoutMs)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    const abortReason = (): 'client' | 'timeout' | null =>
      request.signal?.aborted ? 'client' : timeout.aborted ? 'timeout' : null

    try {
      const graph = this.buildCompiledGraph(chatModel, request, limits.maxToolRounds, canForceTool)
      const stream = await graph.stream(
        { messages: initialMessages },
        { streamMode: ['custom', 'updates'], signal },
      )

      for await (const [mode, payload] of stream) {
        if (mode === 'custom') {
          const ev = payload as AdvisorStreamEvent
          if (ev.event === 'token') {
            streamedTokenCount++
            streamedText += ev.data.text
          }
          if (ev.event === 'reasoning') {
            // Thoughts of a later model round start a new paragraph instead of running into the last one.
            const separator = reasoning.length > 0 && reasoningRound !== lastReasoningRound ? '\n\n' : ''
            lastReasoningRound = reasoningRound
            reasoning += separator + ev.data.text
            yield separator.length > 0 ? { event: 'reasoning', data: { text: separator + ev.data.text } } : ev
            continue
          }
          yield ev
          continue
        }

        if (mode === 'updates' && payload && typeof payload === 'object') {
          const updates = payload as Record<string, Partial<typeof AdvisorGraphState.State>>
          for (const nodeUpdate of Object.values(updates)) {
            if (!nodeUpdate) continue
            if (Array.isArray(nodeUpdate.messages)) {
              finalMessages = finalMessages.concat(nodeUpdate.messages)
              reasoningRound += 1
            }
            if ('pendingAction' in nodeUpdate && nodeUpdate.pendingAction !== undefined) {
              pendingAction = nodeUpdate.pendingAction
            }
            if ('pendingTwoPaths' in nodeUpdate && nodeUpdate.pendingTwoPaths !== undefined) {
              pendingTwoPaths = nodeUpdate.pendingTwoPaths
            }
            if (Array.isArray(nodeUpdate.choices)) {
              choices = nodeUpdate.choices
            }
            if (Array.isArray(nodeUpdate.sources)) {
              sources = [...new Set([...sources, ...nodeUpdate.sources])]
            }
          }
        }
      }
    } catch (error) {
      const aborted = abortReason()
      // A failed model call used to vanish into the fallback; operations need to see why (#476).
      if (aborted !== 'client') {
        this.logger.warn(
          `advisor turn failed (${slotConfig.provider}/${slotConfig.model}, ${aborted ?? 'error'}): ${error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)}`,
        )
      }
      // Nobody is listening any more; persisting a turn for a closed connection would only cost money.
      if (aborted === 'client') return
      if (streamedTokenCount === 0) {
        yield* this.emitFallbackTurn(request)
        return
      }
      // Half an answer must not be stored as if it were complete: the client discards it.
      yield {
        event: 'error',
        data:
          aborted === 'timeout'
            ? { code: 'ADVISOR_TURN_TIMEOUT', message: 'Die Eule hat zu lange gebraucht. Bitte stelle deine Frage erneut.' }
            : { code: 'ADVISOR_TURN_FAILED', message: 'Die Antwort der Eule ist unterwegs abgebrochen. Bitte versuche es erneut.' },
      }
      return
    }

    let lastAiMessage: BaseMessage | undefined
    for (let i = finalMessages.length - 1; i >= 0; i -= 1) {
      const candidate = finalMessages[i]
      if (candidate instanceof AIMessage || candidate instanceof AIMessageChunk) {
        lastAiMessage = candidate
        break
      }
    }
    const lastAiText = lastAiMessage ? extractMessageText(lastAiMessage.content) : ''
    let replyText = (streamedText || lastAiText).trim()

    if (replyText.length === 0) {
      replyText = pendingAction
        ? `Ich habe den Entwurf „${pendingAction.label}“ als unverbindlichen Vorschlag vorbereitet.`
        : pendingTwoPaths
          ? `Ich habe zwei steuerliche Wege für „${pendingTwoPaths.title}“ vorbereitet.`
          : 'Ich habe deine Steuerakte geprüft.'
    }

    if (streamedTokenCount === 0 && replyText.length > 0) {
      yield { event: 'token', data: { text: replyText } }
    }

    const usage = sumUsage(finalMessages)
    const meta: AdvisorMessageMeta = {
      ...(choices.length > 0 ? { choices } : {}),
      ...(pendingAction ? { action: pendingAction } : {}),
      ...(pendingTwoPaths ? { twoPaths: pendingTwoPaths } : {}),
      ...(sources.length > 0 ? { sources } : {}),
    }

    if (meta.choices && meta.choices.length > 0) {
      yield { event: 'choices', data: { choices: meta.choices } }
    }
    if (meta.action) {
      yield { event: 'action', data: meta.action }
    }
    if (meta.twoPaths) {
      yield { event: 'twoPaths', data: meta.twoPaths }
    }

    const result: AdvisorTurnResult = {
      replyText,
      meta,
      mode: 'langgraph',
      provider: slotConfig.provider,
      model: slotConfig.model,
      ...(reasoning.trim().length > 0 ? { reasoning: reasoning.trim() } : {}),
      ...(usage ? { usage } : {}),
    }
    yield { event: 'done', data: result }
  }

  async runTurn(request: AdvisorTurnRequest): Promise<AdvisorTurnResult> {
    let finalResult: AdvisorTurnResult | null = null
    for await (const ev of this.streamTurn(request)) {
      if (ev.event === 'done') {
        finalResult = ev.data as AdvisorTurnResult
      }
    }
    if (!finalResult) {
      const fallback = evaluateAdvisorTurn({
        message: request.message,
        activeScreen: request.activeScreen,
        digest: request.digest,
        actionIdFactory: request.actionIdFactory,
      })
      return {
        replyText: fallback.replyText,
        meta: fallback.meta,
        mode: 'deterministic_fallback',
        provider: 'deterministic',
        model: 'deterministic-fallback',
      }
    }
    return finalResult
  }
}
