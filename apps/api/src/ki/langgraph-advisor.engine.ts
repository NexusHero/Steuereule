import { randomUUID } from 'node:crypto'
import { newActionId } from '../common/action-id.js'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage, type BaseMessage, type UsageMetadata } from '@langchain/core/messages'
import { concat } from '@langchain/core/utils/stream'
import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from '@langchain/langgraph'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { z } from 'zod'
import {
  ADVISOR_LEGAL_SOURCES,
  checkAdvisorAnswer,
  checkAdvisorInputBoundary,
  ADVISOR_NOTES_MAX,
  resolveNoteHandle,
  tidyNoteText,
  evaluateAdvisorTurn,
  fieldSpec,
  resolveRecordHandle,
  simulateAdvisorFieldDelta,
  type AdvisorActionProposal,
  type AdvisorEnginePort,
  type AdvisorMessageMeta,
  type AdvisorNoteChange,
  type AdvisorPreviewEffect,
  type AdvisorPreviewTarget,
  type AdvisorStreamEvent,
  type AdvisorSummaryRequest,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
  type AdvisorTurnUsage,
  type AdvisorTwoPathsProposal,
  type OwlSourceId,
  type RecordHandleResolution,
  type Screen,
} from '@steuereule/core'
import { AI_RUNTIME_CONFIG_SERVICE, DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type AiTurnLimits, type ResolvedAiSlotConfig } from './ai-runtime-config.service.js'
import { CHAT_MODEL_FACTORY, createChatModelFromConfig, type ChatModelFactory } from './chat-model.factory.js'
import { checkStageValue, normalizeSourceId, validateStageTarget, type StageTargetCheck } from './advisor-safety.js'
import { checkPiiFree } from './ki.adapter.js'
import { buildSystemMessage, SUMMARY_MAX_CHARS, SUMMARY_INSTRUCTIONS } from './advisor-prompt.js'
import {
  MAX_COMPANION_FIELDS,
  TOOL_LABELS,
  TOOL_ARG_SCHEMAS,
  buildToolSchemas,
  isToolName,
  toolResult,
  RejectedDraft,
  MAX_DRAFTS_PER_TURN,
  draftKey,
  computedFiguresOf,
  humanReason,
  unresolvedRejections,
} from './advisor-tools.js'
export { toProviderToolSchema, buildToolSchemas, computedFiguresOf, unresolvedRejections } from './advisor-tools.js'
export { buildStableSystemPrompt, buildSystemMessage } from './advisor-prompt.js'

export const ADVISOR_ENGINE = Symbol('ADVISOR_ENGINE')

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

const AdvisorGraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  toolRounds: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  /** Every draft of this answer, in the order they were made; a later one for the same field replaces the earlier. */
  pendingActions: Annotation<AdvisorActionProposal[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  /** Drafts the model asked for and did not get, with the screen they aimed at. */
  rejectedDrafts: Annotation<RejectedDraft[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  pendingTwoPaths: Annotation<AdvisorTwoPathsProposal | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  choices: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  noteChanges: Annotation<AdvisorNoteChange[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  sources: Annotation<OwlSourceId[]>({
    reducer: (left, right) => [...new Set([...left, ...right])],
    default: () => [],
  }),
})

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
      let pendingActions = state.pendingActions
      let rejectedDrafts = state.rejectedDrafts
      let pendingTwoPaths = state.pendingTwoPaths
      let choices = state.choices
      let noteChanges = state.noteChanges
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
        /** Refuses a draft: the model gets the reason, and the answer will carry it unless a retry succeeds. */
        const refuseDraft = (label: string, screen: string, error: string, openScreen?: Screen): void => {
          rejectedDrafts = [...rejectedDrafts, { label, screen, reason: humanReason(error), ...(openScreen ? { openScreen } : {}) }]
        }
        /**
         * Which stored record a draft is for. Masks with one record per case take no instance at
         * all; the others are addressed by their neutral name, and the id is filled in here.
         */
        const resolveInstance = (screen: Screen, field: string, raw: string | null | undefined): RecordHandleResolution | { ok: true; id: null; handle: null } => {
          if (!fieldSpec(screen, field)?.perInstance) return { ok: true, id: null, handle: null }
          return resolveRecordHandle(screen, request.records?.[screen] ?? [], raw)
        }

        /**
         * The euro effect of a draft: from the app's own estimate where the caller offers it, and
         * never a made-up figure when the estimate cannot say. The approximation over the digest
         * only remains for setups without a database behind the engine.
         */
        const effectOf = async (
          target: AdvisorPreviewTarget,
          approximation: { beforeRefundEur: number; afterRefundEur: number; deltaEur: number },
        ): Promise<Pick<AdvisorActionProposal, 'beforeRefundEur' | 'afterRefundEur' | 'deltaEur' | 'effect' | 'effectHint'>> => {
          if (!request.previewEffect) return approximation
          let preview: AdvisorPreviewEffect
          try {
            preview = await request.previewEffect(target)
          } catch {
            preview = { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
          }
          if (preview.kind === 'computed') {
            return { beforeRefundEur: preview.beforeRefundEur, afterRefundEur: preview.afterRefundEur, deltaEur: preview.deltaEur, effect: 'computed' }
          }
          return { beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effect: 'not-computable', effectHint: preview.hint }
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
          const simRecord = resolveInstance(target.screen, field.trim(), null)
          const simEffect = simRecord.ok
            ? await effectOf({ screen: target.screen, instance: simRecord.id, values: [[field.trim(), simValue.value]] }, sim)
            : ({ beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effect: 'not-computable', effectHint: simRecord.reason } as const)
          toolMessages.push(new ToolMessage({ tool_call_id: callId, name: tc.name, content: JSON.stringify({ ok: true, previousValue: sim.previousValue, ...simEffect }) }))
          continue
        }

        if (tc.name === 'stage_field_draft') {
          const args = parseArgs(TOOL_ARG_SCHEMAS.stage_field_draft)
          if (args === null) continue
          const { screen, field, label, reason } = args
          const sourceId = normalizeSourceId(args.sourceId)
          const rawCompanions = Object.entries(args.companionFields ?? {}).map(([k, v]) => [k.trim(), v] as const)

          const target = validateStageTarget(screen, field)
          if (!target.ok) {
            refuseDraft(label, screen, target.error)
            rejectTarget(target)
            continue
          }
          if (rawCompanions.length > MAX_COMPANION_FIELDS) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `INVALID_ARGUMENTS: höchstens ${MAX_COMPANION_FIELDS} Begleitfelder.` }))
            continue
          }
          const record = resolveInstance(target.screen, field.trim(), args.instance)
          if (!record.ok) {
            const error = `${record.code}: ${record.reason}`
            // No record yet: the user creates it in the mask, and the chat offers the way there.
            // Which of several: that is a question for the user, not something to report as failed.
            if (record.code !== 'RECORD_REQUIRED') refuseDraft(label, screen, error, record.code === 'NO_RECORD' ? target.screen : undefined)
            if (record.code === 'NO_RECORD') {
              config?.writer?.({ event: 'ui_command', data: { openMask: target.screen, focus: field.trim() } } satisfies AdvisorStreamEvent)
            }
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error }))
            continue
          }
          const instance = record.id
          if (pendingActions.length >= MAX_DRAFTS_PER_TURN) {
            const error = `TOO_MANY_DRAFTS: höchstens ${MAX_DRAFTS_PER_TURN} Entwürfe pro Antwort. Bitte den Nutzer erst diese prüfen lassen.`
            refuseDraft(label, screen, error)
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error }))
            continue
          }
          // Companion fields are written with the same rights as the main field, so they pass the same gate.
          const lockedCompanion = rawCompanions
            .map(([companionField]) => validateStageTarget(screen, companionField))
            .find((check): check is Extract<StageTargetCheck, { ok: false }> => !check.ok)
          if (lockedCompanion) {
            refuseDraft(label, screen, lockedCompanion.error)
            rejectTarget(lockedCompanion)
            continue
          }
          // Every value is checked against the field catalogue and stored in its tidied form: a
          // draft that could not be applied is refused here, with the reason, instead of being made.
          const checkedValues = [[field.trim(), args.newValue] as const, ...rawCompanions].map(([name, value]) => ({ name, check: checkStageValue(screen, name, value) }))
          const badValue = checkedValues.find((entry) => !entry.check.ok)
          if (badValue && !badValue.check.ok) {
            refuseDraft(label, screen, badValue.check.error)
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
          const effect = await effectOf({ screen: target.screen, instance, values: [...companionEntries, [cleanField, newValue]] }, sim)
          sources.push(sourceId)

          const stagedAction: AdvisorActionProposal = {
            actionId: makeActionId(),
            status: 'pending',
            screen: target.screen,
            field: cleanField,
            instance,
            ...(companionFields ? { companionFields } : {}),
            label: record.handle && !label.includes(record.handle) ? `${label} (${record.handle})` : label,
            previousValue: sim.previousValue,
            expectedPreviousValue: sim.previousValue,
            newValue,
            ...effect,
            reason,
            sourceId,
            paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
          }

          // Several drafts in one answer stand side by side; a second one for the same field is a correction.
          pendingActions = [...pendingActions.filter((existing) => draftKey(existing) !== draftKey(stagedAction)), stagedAction]

          toolMessages.push(toolResult(callId, tc.name, { ok: true, stagedAction: { ...stagedAction, instance: record.handle }, draftsInThisAnswer: pendingActions.length }))
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

          // Two paths name no record: fine while there is exactly one, a question for the user otherwise.
          const safeRecord = resolveInstance(safeCheck.screen, safeField, rawSafe.instance)
          const maxRecord = resolveInstance(maxCheck.screen, maxField, rawMax.instance)
          const missingRecord = !safeRecord.ok ? safeRecord : !maxRecord.ok ? maxRecord : null
          if (!safeRecord.ok || !maxRecord.ok || missingRecord) {
            toolMessages.push(toolResult(callId, tc.name, { ok: false, error: missingRecord ? `${missingRecord.code}: ${missingRecord.reason}` : '' }))
            continue
          }
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
          const safeEffect = await effectOf({ screen: safeCheck.screen, instance: safeRecord.id, values: [[safeField, safeNewValue]] }, safeSim)
          const maxEffect = await effectOf({ screen: maxCheck.screen, instance: maxRecord.id, values: [[maxField, maxNewValue]] }, maxSim)
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
              instance: safeRecord.id,
              label: rawSafe.label,
              previousValue: safeSim.previousValue,
              expectedPreviousValue: safeSim.previousValue,
              newValue: safeNewValue,
              ...safeEffect,
              reason: rawSafe.reason,
              sourceId,
              paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
            },
            maxPath: {
              actionId: `${baseActionId}-max`,
              status: 'pending',
              screen: maxCheck.screen,
              field: maxField,
              instance: maxRecord.id,
              label: rawMax.label,
              previousValue: maxSim.previousValue,
              expectedPreviousValue: maxSim.previousValue,
              newValue: maxNewValue,
              ...maxEffect,
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

        if (tc.name === 'remember_note' || tc.name === 'replace_note' || tc.name === 'forget_note') {
          // The notes as they stand after what this answer has already changed.
          const gone = new Set(noteChanges.filter((change) => change.kind === 'removed').map((change) => change.noteId))
          const added = noteChanges.filter((change) => change.kind === 'added').length
          const known = (request.notes ?? []).filter((note) => !gone.has(note.id))
          const refuse = (error: string) => toolMessages.push(toolResult(callId, tc.name, { ok: false, error }))

          if (tc.name === 'forget_note') {
            const args = parseArgs(TOOL_ARG_SCHEMAS.forget_note)
            if (args === null) continue
            const note = resolveNoteHandle(known, args.note)
            if (!note) {
              refuse(`UNKNOWN_NOTE: „${args.note}“ gibt es nicht. Vorhanden: ${known.map((n) => n.handle).join(', ') || 'keine'}.`)
              continue
            }
            noteChanges = [...noteChanges.filter((change) => change.noteId !== note.id), { kind: 'removed', noteId: note.id, text: note.text }]
            toolMessages.push(toolResult(callId, tc.name, { ok: true, removed: note.handle }))
            continue
          }

          // One parse per call: a failed parse has already answered the call with its error.
          const replaceArgs = tc.name === 'replace_note' ? parseArgs(TOOL_ARG_SCHEMAS.replace_note) : null
          const args = tc.name === 'replace_note' ? replaceArgs : parseArgs(TOOL_ARG_SCHEMAS.remember_note)
          if (args === null) continue
          const text = tidyNoteText(args.text)
          if (!text.ok) {
            refuse(`INVALID_NOTE: ${text.reason}`)
            continue
          }
          try {
            checkPiiFree({ note: text.text })
          } catch {
            refuse('INVALID_NOTE: Eine Notiz darf keine persönlichen Daten enthalten (Namen, Adressen, Steuer-ID, IBAN, Geburtsdatum).')
            continue
          }
          if (replaceArgs !== null) {
            const note = resolveNoteHandle(known, replaceArgs.note)
            if (!note) {
              refuse(`UNKNOWN_NOTE: „${replaceArgs.note}“ gibt es nicht. Vorhanden: ${known.map((n) => n.handle).join(', ') || 'keine'}.`)
              continue
            }
            const before = noteChanges.find((change) => change.noteId === note.id)?.previousText ?? note.text
            noteChanges = [...noteChanges.filter((change) => change.noteId !== note.id), { kind: 'replaced', noteId: note.id, text: text.text, previousText: before }]
            toolMessages.push(toolResult(callId, tc.name, { ok: true, replaced: note.handle }))
            continue
          }
          if (known.length + added >= ADVISOR_NOTES_MAX) {
            refuse(`TOO_MANY_NOTES: höchstens ${ADVISOR_NOTES_MAX} Notizen. Ersetze oder entferne zuerst eine überholte.`)
            continue
          }
          if ([...known.map((n) => n.text), ...noteChanges.filter((c) => c.kind === 'added').map((c) => c.text)].some((existing) => existing.toLowerCase() === text.text.toLowerCase())) {
            toolMessages.push(toolResult(callId, tc.name, { ok: true, alreadyNoted: true }))
            continue
          }
          noteChanges = [...noteChanges, { kind: 'added', text: text.text }]
          toolMessages.push(toolResult(callId, tc.name, { ok: true, noted: text.text }))
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
        pendingActions,
        rejectedDrafts,
        pendingTwoPaths,
        choices,
        noteChanges,
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
      request.records,
      request.notes,
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
    let pendingActions: AdvisorActionProposal[] = []
    let rejectedDrafts: RejectedDraft[] = []
    let noteChanges: AdvisorNoteChange[] = []
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
            if (Array.isArray(nodeUpdate.pendingActions)) {
              pendingActions = nodeUpdate.pendingActions
            }
            if (Array.isArray(nodeUpdate.rejectedDrafts)) {
              rejectedDrafts = nodeUpdate.rejectedDrafts
            }
            if ('pendingTwoPaths' in nodeUpdate && nodeUpdate.pendingTwoPaths !== undefined) {
              pendingTwoPaths = nodeUpdate.pendingTwoPaths
            }
            if (Array.isArray(nodeUpdate.choices)) {
              choices = nodeUpdate.choices
            }
            if (Array.isArray(nodeUpdate.noteChanges)) {
              noteChanges = nodeUpdate.noteChanges
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
      replyText = pendingActions.length === 1
        ? `Ich habe den Entwurf „${pendingActions[0]!.label}“ als unverbindlichen Vorschlag vorbereitet.`
        : pendingActions.length > 1
          ? `Ich habe ${pendingActions.length} Entwürfe als unverbindliche Vorschläge vorbereitet.`
          : pendingTwoPaths
          ? `Ich habe zwei steuerliche Wege für „${pendingTwoPaths.title}“ vorbereitet.`
          : 'Ich habe deine Steuerakte geprüft.'
    }

    if (streamedTokenCount === 0 && replyText.length > 0) {
      yield { event: 'token', data: { text: replyText } }
    }

    const usage = sumUsage(finalMessages)
    const notStaged = unresolvedRejections(rejectedDrafts, pendingActions)
    // The finished text is checked without a model; what it finds, the app says under the answer.
    const notices = checkAdvisorAnswer({
      replyText,
      userMessage: request.message,
      drafts: [...pendingActions, ...(pendingTwoPaths ? [pendingTwoPaths.safePath, pendingTwoPaths.maxPath] : [])],
      notStagedCount: notStaged.length,
      computedFigures: computedFiguresOf(finalMessages),
    })
    const meta: AdvisorMessageMeta = {
      ...(choices.length > 0 ? { choices } : {}),
      // One draft keeps its place as `action`; several travel as `actions` and are reviewed together.
      ...(pendingActions.length === 1 ? { action: pendingActions[0]! } : {}),
      ...(pendingActions.length > 1 ? { actions: pendingActions } : {}),
      ...(pendingTwoPaths ? { twoPaths: pendingTwoPaths } : {}),
      ...(sources.length > 0 ? { sources } : {}),
      ...(notStaged.length > 0 ? { notStaged } : {}),
      ...(notices.length > 0 ? { notices } : {}),
      ...(noteChanges.length > 0 ? { noteChanges } : {}),
    }

    if (meta.choices && meta.choices.length > 0) {
      yield { event: 'choices', data: { choices: meta.choices } }
    }
    for (const action of pendingActions) {
      yield { event: 'action', data: action }
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

  /**
   * One plain model call without tools. The model is told to keep to what was said: a summary is
   * the only memory of the older conversation, so an invented detail would be read as a fact later.
   */
  async summarize(input: AdvisorSummaryRequest): Promise<string | null> {
    try {
      checkPiiFree({ transcript: input.transcript, previousSummary: input.previousSummary ?? '' })
      if (await this.runtimeConfig.isKillSwitchActive()) return null
      const slotConfig = await this.runtimeConfig.resolveSlot('advisor_chat')
      if (!slotConfig.enabled || slotConfig.provider === 'deterministic' || slotConfig.provider === 'fake') return null
      // A summary needs no line of thought: the plain, quick variant of the same model.
      const { reasoning: _reasoning, reasoningBudgetTokens: _budget, ...plain } = slotConfig
      const model = this.resolveChatModel({ ...plain, thinkingLevel: 'low' })
      if (!model) return null
      const { turnTimeoutMs } = await this.runtimeConfig.resolveLimits()
      const response = await model.invoke(
        [
          new SystemMessage(SUMMARY_INSTRUCTIONS),
          new HumanMessage(
            [...(input.previousSummary ? ['Bisherige Zusammenfassung:', input.previousSummary, ''] : []), 'Gesprächsverlauf:', input.transcript].join('\n'),
          ),
        ],
        { signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(turnTimeoutMs)]) : AbortSignal.timeout(turnTimeoutMs) },
      )
      const text = extractMessageText(response.content).trim()
      if (text === '') return null
      checkPiiFree({ summary: text })
      return text.slice(0, SUMMARY_MAX_CHARS)
    } catch (error) {
      this.logger.warn(`conversation summary failed: ${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`)
      return null
    }
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
