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
} from '@langchain/core/messages'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { concat } from '@langchain/core/utils/stream'
import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from '@langchain/langgraph'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { z } from 'zod'
import {
  ADVISOR_LEGAL_SOURCES,
  checkAdvisorInputBoundary,
  evaluateAdvisorTurn,
  simulateAdvisorFieldDelta,
  type AdvisorActionProposal,
  type AdvisorEnginePort,
  type AdvisorMessageMeta,
  type AdvisorStreamEvent,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
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
import { normalizeSourceId, validateStageTarget, type StageTargetCheck } from './advisor-safety.js'
import { checkPiiFree } from './ki.adapter.js'

export const ADVISOR_ENGINE = Symbol('ADVISOR_ENGINE')

const MAX_COMPANION_FIELDS = 3

const TOOL_LABELS: Readonly<Record<string, string>> = {
  simulate_tax_delta: 'Simuliere Vorher/Nachher-Steuerwirkung …',
  stage_field_draft: 'Bereite sicheren Entwurf vor …',
  propose_two_paths: 'Vergleiche Zwei-Wege-Strategien …',
  ask_clarification: 'Prüfe Rückfragen …',
  lookup_legal_source: 'Prüfe EStG-Paragraph …',
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

function buildSystemPrompt(digest: CaseDigest, activeScreen?: Screen): string {
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
    `Aktive Maske: ${activeScreen ?? 'cockpit'}`,
    'PII-freier Fall-Überblick (CaseDigest):',
    JSON.stringify(digest),
  ].join('\n')
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
}

// The bodies are never invoked: toolsNode executes the calls itself so it can update graph state.
function buildToolSchemas(): readonly StructuredToolInterface[] {
  return (Object.keys(TOOL_ARG_SCHEMAS) as ToolName[]).map((name) =>
    tool(async () => '', { name, description: TOOL_DESCRIPTIONS[name], schema: TOOL_ARG_SCHEMAS[name] }),
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
  ) {
    const tools = buildToolSchemas()
    const boundModel = typeof model.bindTools === 'function' ? model.bindTools([...tools]) : model
    const makeActionId = request.actionIdFactory ?? (newActionId)

    const agentNode = async (
      state: typeof AdvisorGraphState.State,
      config?: LangGraphRunnableConfig,
    ) => {
      let aggregated: AIMessageChunk | null = null
      let lastFallbackMsg: AIMessage | null = null

      const streamOrValue = await boundModel.stream(state.messages, config)
      for await (const chunk of streamOrValue) {
        if (chunk instanceof AIMessageChunk) {
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
          const sim = simulateAdvisorFieldDelta(request.digest, target.screen, field.trim(), newValue)
          toolMessages.push(new ToolMessage({ tool_call_id: callId, name: tc.name, content: JSON.stringify({ ok: true, ...sim }) }))
          continue
        }

        if (tc.name === 'stage_field_draft') {
          const args = parseArgs(TOOL_ARG_SCHEMAS.stage_field_draft)
          if (args === null) continue
          const { screen, field, newValue, label, reason } = args
          const instance = args.instance && args.instance.trim().length > 0 ? args.instance.trim() : null
          const sourceId = normalizeSourceId(args.sourceId)
          const companionEntries = Object.entries(args.companionFields ?? {}).map(([k, v]) => [k.trim(), v] as const)

          const target = validateStageTarget(screen, field)
          if (!target.ok) {
            rejectTarget(target)
            continue
          }
          if (companionEntries.length > MAX_COMPANION_FIELDS) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `INVALID_ARGUMENTS: höchstens ${MAX_COMPANION_FIELDS} Begleitfelder.` }))
            continue
          }
          // Companion fields are written with the same rights as the main field, so they pass the same gate.
          const lockedCompanion = companionEntries
            .map(([companionField]) => validateStageTarget(screen, companionField))
            .find((check): check is Extract<StageTargetCheck, { ok: false }> => !check.ok)
          if (lockedCompanion) {
            rejectTarget(lockedCompanion)
            continue
          }
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
          const safeNewValue = rawSafe.newValue
          const maxField = rawMax.field.trim()
          const maxNewValue = rawMax.newValue

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

    const systemMessage = new SystemMessage(buildSystemPrompt(request.digest, request.activeScreen))
    const historyMessages: BaseMessage[] = (request.history ?? []).map((entry) =>
      entry.role === 'user' ? new HumanMessage(entry.content) : new AIMessage(entry.content),
    )
    const initialMessages: BaseMessage[] = [systemMessage, ...historyMessages, new HumanMessage(request.message)]

    let streamedTokenCount = 0
    let streamedText = ''
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
      const graph = this.buildCompiledGraph(chatModel, request, limits.maxToolRounds)
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
          yield ev
          continue
        }

        if (mode === 'updates' && payload && typeof payload === 'object') {
          const updates = payload as Record<string, Partial<typeof AdvisorGraphState.State>>
          for (const nodeUpdate of Object.values(updates)) {
            if (!nodeUpdate) continue
            if (Array.isArray(nodeUpdate.messages)) {
              finalMessages = finalMessages.concat(nodeUpdate.messages)
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
    } catch {
      const aborted = abortReason()
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
